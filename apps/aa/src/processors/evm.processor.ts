// apps/aa/src/processors/evm.processor.ts
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { Job, Queue } from 'bull';
import { ethers } from 'ethers';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { AddTriggerDto } from '../stellar/dto/trigger.dto';

// Contract ABIs (you'll need to generate these from your Solidity contracts)
// Contract ABIs - importing as require to avoid JSON module resolution issues
const AAProjectABI = require('../contracts/abis/AAProject.json');
const TriggerManagerABI = require('../contracts/abis/TriggerManager.json');
const RahatTokenABI = require('../contracts/abis/RahatToken.json');

interface EVMTransactionResult {
  txHash: string;
  blockNumber?: number;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  gasUsed?: bigint;
  contractAddress?: string;
}

interface EVMDisbursementJob {
  beneficiaries: string[];
  amounts: string[];
  groupUuid: string;
  projectContract: string;
}

interface EVMTriggerJob {
  triggers: AddTriggerDto[];
}

interface EVMStatusUpdateJob {
  txHash: string;
  groupUuid: string;
  beneficiaries: string[];
  amounts: string[];
  identifier: string;
}

@Processor(BQUEUE.EVM)
@Injectable()
export class EVMProcessor {
  private readonly logger = new Logger(EVMProcessor.name);
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private isInitialized = false;

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly settingService: SettingsService,
    @InjectQueue(BQUEUE.EVM) private readonly evmQueue: Queue,
    private readonly prismaService: PrismaService
  ) {
    this.initializeProvider();
  }

  private async initializeProvider() {
    try {
      const chainConfig = await this.getFromSettings('CHAIN_CONFIG');
      const evmPrivateKey = await this.getFromSettings('EVM_PRIVATE_KEY');

      this.provider = new ethers.JsonRpcProvider(
        chainConfig.rpcUrl || 'http://localhost:8545'
      );
      this.signer = new ethers.Wallet(evmPrivateKey, this.provider);

      // Test the connection
      await this.provider.getBlockNumber();
      this.isInitialized = true;

      this.logger.log('EVM Provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EVM provider:', error);
      this.isInitialized = false;
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initializeProvider();
    }

    if (!this.isInitialized) {
      throw new RpcException('EVM provider not initialized');
    }
  }

  @Process({ name: JOBS.EVM.ASSIGN_TOKENS, concurrency: 1 })
  async assignTokens(job: Job<EVMDisbursementJob>) {
    try {
      this.logger.log('Processing EVM assign tokens...', EVMProcessor.name);
      await this.ensureInitialized();

      const { beneficiaries, amounts, groupUuid } = job.data;

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(`Group ${groupUuid} not found`, EVMProcessor.name);
        return;
      }

      const aaContract = await this.createContractInstanceSign(
        'AAPROJECT',
        AAProjectABI,
        this.signer
      );

      const assignTokenToBeneficiary = await this.multiSend(
        aaContract,
        'assignTokenToBeneficiary',
        [beneficiaries, amounts]
      );
      await assignTokenToBeneficiary.wait();

      this.logger.log(
        'contract called with txn hash:',
        assignTokenToBeneficiary.hash
      );

      // TODO: Add the logic to update the group token reservation
      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'STARTED',
        isDisbursed: false,
        info: assignTokenToBeneficiary,
      });

      // TODO: Add the logic to update the beneficiary token reservation
      // this.evmQueue.add(
      //   JOBS.EVM.DISBURSEMENT_STATUS_UPDATE,
      //   {
      //     txHash: assignTokenToBeneficiary.hash,
      //     groupUuid,
      //   },
      //   {
      //     delay: 3 * 60 * 1000, // 3 min
      //   }
      // );
    } catch (error) {
      this.logger.error(
        `Error in EVM assign tokens: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE, concurrency: 1 })
  async disbursementStatusUpdate(job: Job<EVMStatusUpdateJob>) {
    try {
      this.logger.log(
        'Processing EVM disbursement status update...',
        EVMProcessor.name
      );

      await this.ensureInitialized();
      const { groupUuid } = job.data;

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(`Group ${groupUuid} not found`, EVMProcessor.name);
        return;
      }
    } catch (error) {
      this.logger.error(
        `Error in EVM disbursement status update: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.settingService.getPublic('CHAIN_CONFIG');
      if (!settings?.value) {
        throw new Error('CHAIN_CONFIG not found');
      }

      const chainConfig = settings.value;

      // Handle different key mappings
      const keyMappings: Record<string, string> = {
        CHAIN_CONFIG: 'chainConfig',
        EVM_PRIVATE_KEY: 'privateKey',
        TRIGGER_MANAGER_CONTRACT: 'triggerManagerAddress',
        PROJECT_CONTRACT: 'projectContractAddress',
        TOKEN_CONTRACT: 'tokenContractAddress',
      };

      const mappedKey = keyMappings[key] || key;

      if (!chainConfig[mappedKey]) {
        throw new Error(
          `Setting ${key} (${mappedKey}) not found in CHAIN_CONFIG`
        );
      }

      return chainConfig[mappedKey];
    } catch (error) {
      this.logger.error(`Error getting setting ${key}: ${error.message}`);
      throw error;
    }
  }

  private async multiSend(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = this.generateMultiCallData(
      contract,
      functionName,
      callData
    );
    const tx = await contract.multicall(encodedData);
    const result = await tx.wait();
    return result;
  }

  private generateMultiCallData(
    contract: ethers.Contract,
    functionName: string,
    callData: string[] | string[][]
  ) {
    const encodedData = [];
    for (const call of callData) {
      const encoded = contract.interface.encodeFunctionData(functionName, [
        call,
      ]);
      encodedData.push(encoded);
    }
    return encodedData;
  }

  private async createContractInstanceSign(
    contractName: any,
    abi: any,
    signer: ethers.Signer
  ) {
    return new ethers.Contract(contractName, abi, signer);
  }
}
