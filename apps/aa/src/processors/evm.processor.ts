// apps/aa/src/processors/evm.processor.ts
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Logger, Injectable, Inject } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { SettingsService } from '@rumsan/settings';
import { ethers } from 'ethers';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  DisburseDto,
  IDisbursementResultDto,
} from '../stellar/dto/disburse.dto';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { PrismaService } from '@rumsan/prisma';
import {
  AddTriggerDto,
  UpdateTriggerParamsDto,
} from '../stellar/dto/trigger.dto';
import { BeneficiaryRedeem, Prisma } from '@prisma/client';

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

@Processor(BQUEUE.CONTRACT)
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
    @InjectQueue(BQUEUE.CONTRACT)
    private readonly contractQueue: Queue,
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
}
