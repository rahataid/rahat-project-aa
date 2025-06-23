import { Injectable, Logger, Inject } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, JOBS } from '../../constants';
import {
  ChainType,
  IChainService,
  AddTriggerDto,
  DisburseDto,
  AssignTokensDto,
  TransferTokensDto,
  FundAccountDto,
  SendOtpDto,
  VerifyOtpDto,
} from '../interfaces/chain-service.interface';
import { SettingsService } from '@rumsan/settings';
import { ethers } from 'ethers';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CORE_MODULE } from '../../constants';

export interface EVMChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  currencyName: string;
  currencySymbol: string;
  currencyDecimals: number;
  projectContractAddress: string;
  tokenContractAddress: string;
  triggerManagerAddress: string;
  privateKey: string;
}

@Injectable()
export class EVMChainService implements IChainService {
  private readonly logger = new Logger(EVMChainService.name);
  private provider: ethers.Provider;

  constructor(
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy
  ) {
    this.initializeProvider();
  }

  getChainType(): ChainType {
    return 'evm';
  }

  async initialize(): Promise<boolean> {
    try {
      await this.initializeProvider();
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize EVM service:', error);
      return false;
    }
  }

  async disburseBatch(
    beneficiaries: string[],
    amounts: string[],
    groupUuid: string
  ): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();

      const job = await this.contractQueue.add(
        JOBS.CONTRACT.DISBURSE_BATCH,
        {
          beneficiaries,
          amounts,
          groupUuid,
          projectContract: chainConfig.projectContractAddress,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      this.logger.log(
        `Queued EVM disbursement job ${job.id} for group ${groupUuid}`,
        EVMChainService.name
      );

      return {
        jobId: job.id,
        status: 'QUEUED',
        groupUuid,
        beneficiariesCount: beneficiaries.length,
        totalAmount: amounts.reduce(
          (sum, amount) => sum + parseFloat(amount),
          0
        ),
      };
    } catch (error) {
      this.logger.error(
        `Error queuing EVM disbursement: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async addTrigger(data: AddTriggerDto): Promise<any> {
    try {
      const job = await this.contractQueue.add(
        JOBS.CONTRACT.ADD_TRIGGER,
        {
          triggers: [data],
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      this.logger.log(
        `Queued EVM add trigger job ${job.id}`,
        EVMChainService.name
      );

      return {
        jobId: job.id,
        status: 'QUEUED',
        triggerCount: 1,
      };
    } catch (error) {
      this.logger.error(
        `Error queuing EVM trigger: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async updateTriggerParams(triggerUpdate: any): Promise<any> {
    try {
      const job = await this.contractQueue.add(
        JOBS.CONTRACT.UPDATE_TRIGGER_PARAMS,
        triggerUpdate,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      this.logger.log(
        `Queued EVM update trigger params job ${job.id}`,
        EVMChainService.name
      );

      return {
        jobId: job.id,
        status: 'QUEUED',
        triggerId: triggerUpdate.id,
      };
    } catch (error) {
      this.logger.error(
        `Error queuing EVM trigger update: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async addBeneficiary(beneficiaryAddress: string): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();

      const job = await this.contractQueue.add(
        JOBS.CONTRACT.ADD_BENEFICIARY,
        {
          projectContract: chainConfig.projectContractAddress,
          beneficiaryAddress,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      this.logger.log(
        `Queued EVM add beneficiary job ${job.id} for ${beneficiaryAddress}`,
        EVMChainService.name
      );

      return {
        jobId: job.id,
        status: 'QUEUED',
        beneficiaryAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error queuing EVM add beneficiary: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async checkBalance(
    address: string,
    options?: { tokenAddress?: string; projectContract?: string }
  ): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();

      const job = await this.contractQueue.add(JOBS.CONTRACT.CHECK_BALANCE, {
        address,
        tokenAddress: options?.tokenAddress || chainConfig.tokenContractAddress,
        projectContract:
          options?.projectContract || chainConfig.projectContractAddress,
      });

      this.logger.log(
        `Queued EVM balance check job ${job.id} for ${address}`,
        EVMChainService.name
      );

      return job.finished();
    } catch (error) {
      this.logger.error(
        `Error checking EVM balance: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async getTransactionStatus(txHash: string): Promise<any> {
    try {
      if (!this.provider) {
        await this.initializeProvider();
      }

      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          txHash,
          status: 'PENDING',
          blockNumber: null,
          gasUsed: null,
        };
      }

      return {
        txHash,
        status: receipt.status === 1 ? 'CONFIRMED' : 'FAILED',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        logs: receipt.logs,
      };
    } catch (error) {
      this.logger.error(
        `Error getting transaction status: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  async getChainStats(): Promise<any> {
    try {
      if (!this.provider) {
        await this.initializeProvider();
      }

      const chainConfig = await this.getChainConfig();

      // Get latest block number
      const blockNumber = await this.provider.getBlockNumber();

      // Get network info
      const network = await this.provider.getNetwork();

      return {
        chainId: network.chainId.toString(),
        blockNumber,
        name: chainConfig.name,
        currency: {
          name: chainConfig.currencyName,
          symbol: chainConfig.currencySymbol,
          decimals: chainConfig.currencyDecimals,
        },
        explorerUrl: chainConfig.explorerUrl,
        contractAddresses: {
          project: chainConfig.projectContractAddress,
          token: chainConfig.tokenContractAddress,
          triggerManager: chainConfig.triggerManagerAddress,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting chain stats: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  // Required interface methods
  async assignTokens(data: AssignTokensDto): Promise<any> {
    const chainConfig = await this.getChainConfig();
    return this.contractQueue.add(JOBS.CONTRACT.ASSIGN_TOKENS, {
      beneficiaryAddress: data.beneficiaryAddress,
      amount: data.amount.toString(),
      projectContract: chainConfig.projectContractAddress,
    });
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    throw new Error('Transfer tokens not implemented for EVM');
  }

  async disburse(data: DisburseDto): Promise<any> {
    try {
      if (!data.groups || data.groups.length === 0) {
        throw new Error('EVM disburse requires groups to be specified');
      }

      this.logger.log(
        `Starting EVM disbursement for groups: ${data.groups.join(', ')}`
      );

      // Get beneficiaries and amounts for each group
      const disbursementData = await this.resolveGroupsToAddresses(data.groups);

      if (disbursementData.beneficiaries.length === 0) {
        throw new Error('No beneficiaries found for the specified groups');
      }

      // Use first group as groupUuid for tracking
      const groupUuid = data.groups[0];

      // Call the actual disbursement method
      return this.disburseBatch(
        disbursementData.beneficiaries,
        disbursementData.amounts,
        groupUuid
      );
    } catch (error) {
      this.logger.error(`Error in EVM disburse: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getDisbursementStatus(id: string): Promise<any> {
    return this.getTransactionStatus(id);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    throw new Error('OTP not supported for EVM');
  }

  async sendAssetToVendor(data: any): Promise<any> {
    throw new Error('Send asset to vendor not implemented for EVM');
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    const chainConfig = await this.getChainConfig();
    return this.contractQueue.add(JOBS.CONTRACT.FUND_ACCOUNT, {
      walletAddress: data.walletAddress,
      amount: data.amount,
    });
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    throw new Error('OTP verification not supported for EVM');
  }

  validateAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  // Helper methods
  private async resolveGroupsToAddresses(groups: string[]): Promise<{
    beneficiaries: string[];
    amounts: string[];
  }> {
    try {
      // Call the beneficiary service to get group data
      const resolvedData = await lastValueFrom(
        this.client.send(
          { cmd: 'aa.jobs.beneficiary.getGroupsWithBeneficiaries' },
          { groups }
        )
      );

      if (!resolvedData || !Array.isArray(resolvedData.beneficiaries)) {
        throw new Error('Invalid group resolution response');
      }

      return {
        beneficiaries: resolvedData.beneficiaries.map(
          (b: any) => b.walletAddress
        ),
        amounts: resolvedData.beneficiaries.map(
          (b: any) => b.tokenAmount?.toString() || '0'
        ),
      };
    } catch (error) {
      this.logger.error(
        `Error resolving groups: ${error.message}`,
        error.stack
      );
      throw new Error(
        `Failed to resolve groups to addresses: ${error.message}`
      );
    }
  }

  private async initializeProvider() {
    try {
      const chainConfig = await this.getChainConfig();
      this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

      // Test connection
      await this.provider.getBlockNumber();

      this.logger.log(
        `EVM provider initialized for ${chainConfig.name} (Chain ID: ${chainConfig.chainId})`,
        EVMChainService.name
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize EVM provider: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }

  private async getChainConfig(): Promise<EVMChainConfig> {
    try {
      const settings = await this.settingsService.getPublic('CHAIN_CONFIG');
      if (!settings?.value) {
        throw new Error('CHAIN_CONFIG not found in settings');
      }

      const config = settings.value as unknown as EVMChainConfig;

      // Validate required fields
      const requiredFields = [
        'rpcUrl',
        'chainId',
        'projectContractAddress',
        'tokenContractAddress',
        'triggerManagerAddress',
        'privateKey',
      ];

      for (const field of requiredFields) {
        if (!config[field as keyof EVMChainConfig]) {
          throw new Error(`Missing required field ${field} in CHAIN_CONFIG`);
        }
      }
      console.log(config);
      return config;
    } catch (error) {
      this.logger.error(
        `Error getting chain config: ${error.message}`,
        error.stack,
        EVMChainService.name
      );
      throw error;
    }
  }
}
