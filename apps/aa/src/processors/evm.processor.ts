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

  @Process({ name: JOBS.CONTRACT.ADD_TRIGGER, concurrency: 1 })
  async addTriggerOnchain(job: Job<EVMTriggerJob>) {
    this.logger.log(
      'Processing add triggers on-chain job...',
      EVMProcessor.name
    );

    await this.ensureInitialized();
    const { triggers } = job.data;

    this.logger.log(
      `Received ${triggers.length} triggers to process`,
      EVMProcessor.name
    );

    for (const trigger of triggers) {
      const maxRetries = job?.opts.attempts || 3;
      let attempt = 1;
      let lastError: any = null;

      while (attempt <= maxRetries) {
        try {
          this.logger.log(
            `Processing trigger ${trigger.id} - Attempt ${attempt} of ${maxRetries}`,
            EVMProcessor.name
          );

          if (attempt > 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }

          const result = await this.createAndSendTriggerTransaction(trigger);

          this.logger.log(
            `Successfully processed trigger ${trigger.id} - Transaction: ${result.txHash}`,
            EVMProcessor.name
          );

          // Update trigger status in database
          const res = await lastValueFrom(
            this.client.send(
              { cmd: 'ms.jobs.triggers.updateTransaction' },
              {
                uuid: trigger.id,
                transactionHash: result.txHash,
              }
            )
          );

          if (res) {
            this.logger.log(
              `Trigger ${trigger.id} status successfully updated in database`,
              EVMProcessor.name
            );
          }

          break;
        } catch (error) {
          lastError = error;
          this.logger.error(
            `Attempt ${attempt} failed for trigger ${trigger.id}: ${error.message}`,
            error.stack,
            EVMProcessor.name
          );

          if (attempt === maxRetries) {
            this.logger.error(
              `All ${maxRetries} attempts failed for trigger ${trigger.id}. Final error: ${error.message}`,
              EVMProcessor.name
            );
          }

          attempt++;
        }
      }
    }
  }

  @Process({ name: JOBS.CONTRACT.DISBURSE_BATCH, concurrency: 1 })
  async disburseBatch(job: Job<EVMDisbursementJob>) {
    this.logger.log('Processing EVM disbursement job...', EVMProcessor.name);

    await this.ensureInitialized();
    const { beneficiaries, amounts, groupUuid, projectContract } = job.data;

    try {
      const result = await this.executeBatchDisbursement(
        projectContract,
        beneficiaries,
        amounts
      );

      this.logger.log(
        `Disbursement job completed successfully: ${result.txHash}`,
        EVMProcessor.name
      );

      // Update group status to STARTED (pending confirmation)
      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'STARTED',
        isDisbursed: false,
        info: {
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          beneficiariesCount: beneficiaries.length,
          contractAddress: projectContract,
        },
      });

      // Schedule status update check after 2 minutes
      this.contractQueue.add(
        JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
        {
          txHash: result.txHash,
          groupUuid,
          beneficiaries,
          amounts,
          identifier: `disbursement_${groupUuid}`,
        },
        {
          delay: 2 * 60 * 1000, // 2 min
        }
      );

      return {
        disbursementID: result.txHash,
        assetIssuer: projectContract,
        txHash: result.txHash,
        status: result.status,
      };
    } catch (error) {
      await this.beneficiaryService.updateGroupToken({
        groupUuid,
        status: 'FAILED',
        isDisbursed: false,
        info: {
          error: error.message,
          stack: error.stack,
          contractAddress: projectContract,
        },
      });

      this.logger.error(
        `Error in EVM disbursement: ${error.message}`,
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
      const { txHash, groupUuid, beneficiaries, amounts, identifier } =
        job.data;

      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        this.logger.log(
          `Transaction ${txHash} not yet mined, retrying in 1 minute`,
          EVMProcessor.name
        );

        // Check if we've been waiting too long (more than 30 minutes)
        const group =
          await this.beneficiaryService.getOneTokenReservationByGroupId(
            groupUuid
          );
        if (
          group &&
          new Date(group.updatedAt).getTime() < Date.now() - 30 * 60 * 1000
        ) {
          this.logger.log(
            `Disbursement timeout for group ${groupUuid}, marking as failed`,
            EVMProcessor.name
          );

          await this.beneficiaryService.updateGroupToken({
            groupUuid,
            status: 'FAILED',
            isDisbursed: false,
            info: {
              ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
              error: 'Transaction confirmation timeout',
              txHash,
            },
          });
          return;
        }

        // Re-queue for checking later
        this.contractQueue.add(
          JOBS.CONTRACT.DISBURSEMENT_STATUS_UPDATE,
          job.data,
          {
            delay: 1 * 60 * 1000, // 1 min
          }
        );
        return;
      }

      const group =
        await this.beneficiaryService.getOneTokenReservationByGroupId(
          groupUuid
        );

      if (!group) {
        this.logger.error(`Group ${groupUuid} not found`, EVMProcessor.name);
        return;
      }

      if (receipt.status === 1) {
        // Transaction successful
        this.logger.log(
          `EVM disbursement ${txHash} completed successfully`,
          EVMProcessor.name
        );

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'DISBURSED',
          isDisbursed: true,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            txHash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            status: 'CONFIRMED',
            beneficiariesProcessed: beneficiaries.length,
            totalAmountDisbursed: amounts.reduce(
              (sum, amount) => sum + parseFloat(amount),
              0
            ),
          },
        });
      } else {
        // Transaction failed
        this.logger.log(`EVM disbursement ${txHash} failed`, EVMProcessor.name);

        await this.beneficiaryService.updateGroupToken({
          groupUuid,
          status: 'FAILED',
          isDisbursed: false,
          info: {
            ...(group.info && { ...JSON.parse(JSON.stringify(group.info)) }),
            txHash,
            blockNumber: receipt.blockNumber,
            status: 'FAILED',
            error: 'Transaction reverted',
          },
        });
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

  @Process({ name: JOBS.CONTRACT.ASSIGN_TOKENS, concurrency: 5 })
  async assignTokens(
    job: Job<{
      beneficiaryAddress: string;
      amount: string;
      projectContract: string;
      groupUuid?: string;
    }>
  ) {
    this.logger.log('Processing token assignment...', EVMProcessor.name);

    await this.ensureInitialized();
    const { beneficiaryAddress, amount, projectContract, groupUuid } = job.data;

    try {
      const contract = new ethers.Contract(
        projectContract,
        AAProjectABI,
        this.signer
      );

      // Get token decimals for proper amount conversion
      const defaultToken = await contract.defaultToken();
      const tokenContract = new ethers.Contract(
        defaultToken,
        RahatTokenABI,
        this.provider
      );
      const decimals = await tokenContract.decimals();

      const tx = await contract.assignTokenToBeneficiary(
        beneficiaryAddress,
        ethers.parseUnits(amount, decimals)
      );

      this.logger.log(
        `Token assignment transaction sent: ${tx.hash}`,
        EVMProcessor.name
      );

      const receipt = await tx.wait();

      this.logger.log(
        `Tokens assigned successfully to ${beneficiaryAddress}. TX: ${tx.hash}`,
        EVMProcessor.name
      );

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Error assigning tokens: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.UPDATE_TRIGGER_PARAMS, concurrency: 1 })
  async updateTriggerParams(job: Job<UpdateTriggerParamsDto>) {
    this.logger.log(
      'Processing update trigger params on-chain...',
      EVMProcessor.name
    );

    await this.ensureInitialized();
    const triggerUpdate = job.data;
    const maxRetries = job?.opts.attempts || 3;
    let attempt = 1;

    while (attempt <= maxRetries) {
      try {
        this.logger.log(
          `Attempt ${attempt} of ${maxRetries} for trigger ${triggerUpdate.id}`,
          EVMProcessor.name
        );

        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const result = await this.updateTriggerOnContract(triggerUpdate);

        this.logger.log(
          `Trigger params updated successfully for ${triggerUpdate.id}`,
          EVMProcessor.name
        );

        // Update database
        const res = await lastValueFrom(
          this.client.send(
            { cmd: 'ms.jobs.triggers.updateTransaction' },
            {
              uuid: triggerUpdate.id,
              transactionHash: result.txHash,
            }
          )
        );

        if (res) {
          this.logger.log(
            `Updated trigger ${triggerUpdate.id} status in database`,
            EVMProcessor.name
          );
        }

        break;
      } catch (error) {
        this.logger.error(
          `Attempt ${attempt} failed for trigger ${triggerUpdate.id}: ${error.message}`,
          error.stack,
          EVMProcessor.name
        );

        if (attempt === maxRetries) {
          this.logger.error(
            `All ${maxRetries} attempts failed for trigger ${triggerUpdate.id}`,
            EVMProcessor.name
          );
          throw error;
        }

        attempt++;
      }
    }
  }

  @Process({ name: JOBS.CONTRACT.CHECK_BALANCE, concurrency: 10 })
  async checkBalance(
    job: Job<{
      address: string;
      tokenAddress?: string;
      projectContract?: string;
    }>
  ) {
    this.logger.log('Checking balance...', EVMProcessor.name);

    await this.ensureInitialized();
    const { address, tokenAddress, projectContract } = job.data;

    try {
      let tokenBalance = '0';
      let ethBalance = '0';
      let assignedTokens = '0';

      // Check ETH balance
      const ethBal = await this.provider.getBalance(address);
      ethBalance = ethers.formatEther(ethBal);

      // Check ERC20 token balance if tokenAddress provided
      if (tokenAddress) {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          RahatTokenABI,
          this.provider
        );
        const tokenBal = await tokenContract.balanceOf(address);
        const decimals = await tokenContract.decimals();
        tokenBalance = ethers.formatUnits(tokenBal, decimals);
      }

      // Check assigned tokens from project contract
      if (projectContract) {
        const contract = new ethers.Contract(
          projectContract,
          AAProjectABI,
          this.provider
        );
        const assignedBal = await contract.benTokens(address);
        assignedTokens = assignedBal.toString();
      }

      return {
        address,
        ethBalance,
        tokenBalance,
        assignedTokens,
        tokenAddress,
        projectContract,
      };
    } catch (error) {
      this.logger.error(
        `Error checking balance: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.MINT_TOKENS, concurrency: 3 })
  async mintTokens(
    job: Job<{
      tokenContract: string;
      toAddress: string;
      amount: string;
    }>
  ) {
    this.logger.log('Processing token minting...', EVMProcessor.name);

    await this.ensureInitialized();
    const { tokenContract, toAddress, amount } = job.data;

    try {
      const contract = new ethers.Contract(
        tokenContract,
        RahatTokenABI,
        this.signer
      );
      const decimals = await contract.decimals();

      const tx = await contract.mint(
        toAddress,
        ethers.parseUnits(amount, decimals)
      );

      const receipt = await tx.wait();

      this.logger.log(
        `Tokens minted successfully: ${amount} to ${toAddress}. TX: ${tx.hash}`,
        EVMProcessor.name
      );

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        amount,
        toAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error minting tokens: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  @Process({ name: JOBS.CONTRACT.ADD_BENEFICIARY, concurrency: 5 })
  async addBeneficiary(
    job: Job<{
      projectContract: string;
      beneficiaryAddress: string;
    }>
  ) {
    this.logger.log('Processing add beneficiary...', EVMProcessor.name);

    await this.ensureInitialized();
    const { projectContract, beneficiaryAddress } = job.data;

    try {
      const contract = new ethers.Contract(
        projectContract,
        AAProjectABI,
        this.signer
      );

      const tx = await contract.addBeneficiary(beneficiaryAddress);
      const receipt = await tx.wait();

      this.logger.log(
        `Beneficiary added successfully: ${beneficiaryAddress}. TX: ${tx.hash}`,
        EVMProcessor.name
      );

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        beneficiaryAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error adding beneficiary: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw error;
    }
  }

  // Private helper methods
  private async createAndSendTriggerTransaction(
    trigger: AddTriggerDto
  ): Promise<EVMTransactionResult> {
    try {
      const triggerManagerAddress = await this.getFromSettings(
        'TRIGGER_MANAGER_CONTRACT'
      );
      const contract = new ethers.Contract(
        triggerManagerAddress,
        TriggerManagerABI,
        this.signer
      );

      const sourceId = ethers.keccak256(ethers.toUtf8Bytes(trigger.id));

      const tx = await contract.updateTriggerSource(
        sourceId,
        trigger.title || 'Unknown Trigger',
        trigger.source || '',
        ethers.ZeroAddress
      );

      const receipt = await tx.wait();

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        gasUsed: receipt.gasUsed,
        contractAddress: triggerManagerAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error creating trigger transaction: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(error.message || 'Trigger transaction failed');
    }
  }

  private async executeBatchDisbursement(
    projectContract: string,
    beneficiaries: string[],
    amounts: string[]
  ): Promise<EVMTransactionResult> {
    try {
      const contract = new ethers.Contract(
        projectContract,
        AAProjectABI,
        this.signer
      );

      // Get token decimals for proper amount conversion
      const defaultToken = await contract.defaultToken();
      const tokenContract = new ethers.Contract(
        defaultToken,
        RahatTokenABI,
        this.provider
      );
      const decimals = await tokenContract.decimals();

      // Use multicall for batch operations
      const calls = beneficiaries.map((address, i) =>
        contract.interface.encodeFunctionData('assignTokenToBeneficiary', [
          address,
          ethers.parseUnits(amounts[i], decimals),
        ])
      );

      const tx = await contract.multicall(calls);
      const receipt = await tx.wait();

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        gasUsed: receipt.gasUsed,
        contractAddress: projectContract,
      };
    } catch (error) {
      this.logger.error(
        `Error in batch disbursement: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(error.message || 'Batch disbursement failed');
    }
  }

  private async updateTriggerOnContract(
    triggerUpdate: UpdateTriggerParamsDto
  ): Promise<EVMTransactionResult> {
    try {
      const triggerManagerAddress = await this.getFromSettings(
        'TRIGGER_MANAGER_CONTRACT'
      );
      const contract = new ethers.Contract(
        triggerManagerAddress,
        TriggerManagerABI,
        this.signer
      );

      // For now, we'll update the required triggers count
      // You can extend this based on your TriggerManager contract's capabilities
      const tx = await contract.setRequiredTriggers(1);
      const receipt = await tx.wait();

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: 'CONFIRMED',
        gasUsed: receipt.gasUsed,
        contractAddress: triggerManagerAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error updating trigger params: ${error.message}`,
        error.stack,
        EVMProcessor.name
      );
      throw new RpcException(error.message || 'Trigger update failed');
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
