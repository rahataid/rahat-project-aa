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
import { PrismaService } from '@rumsan/prisma';
import { querySubgraph } from '../../utils/subgraph';
import { getBeneficiaryAdded } from '@rahataid/subgraph';

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
export class EvmChainService implements IChainService {
  private readonly logger = new Logger(EvmChainService.name);
  private provider: ethers.Provider;
  name = 'evm';
  constructor(
    @InjectQueue(BQUEUE.EVM) private readonly evmQueue: Queue,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService
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

      const job = await this.evmQueue.add(
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
        EvmChainService.name
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
        EvmChainService.name
      );
      throw error;
    }
  }

  async addTrigger(data: AddTriggerDto): Promise<any> {
    // EVM triggers are not implemented yet - throw error for now
    throw new Error('EVM triggers not implemented yet');
  }

  async updateTriggerParams(triggerUpdate: any): Promise<any> {
    // EVM triggers are not implemented yet - throw error for now
    throw new Error('EVM triggers not implemented yet');
  }

  async addBeneficiary(beneficiaryAddress: string): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();

      const job = await this.evmQueue.add(
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
        EvmChainService.name
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
        EvmChainService.name
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

      const job = await this.evmQueue.add(JOBS.CONTRACT.CHECK_BALANCE, {
        address,
        tokenAddress: options?.tokenAddress || chainConfig.tokenContractAddress,
        projectContract:
          options?.projectContract || chainConfig.projectContractAddress,
      });

      this.logger.log(
        `Queued EVM balance check job ${job.id} for ${address}`,
        EvmChainService.name
      );

      return job.finished();
    } catch (error) {
      this.logger.error(
        `Error checking EVM balance: ${error.message}`,
        error.stack,
        EvmChainService.name
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
        EvmChainService.name
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
        EvmChainService.name
      );
      throw error;
    }
  }

  // Required interface methods
  async assignTokens(data: AssignTokensDto): Promise<any> {
    const chainConfig = await this.getChainConfig();
    return this.evmQueue.add(JOBS.CONTRACT.ASSIGN_TOKENS, {
      beneficiaryAddress: data.beneficiaryAddress,
      amount: data.amount.toString(),
      projectContract: chainConfig.projectContractAddress,
    });
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    throw new Error('Transfer tokens not implemented for EVM');
  }

  async disburse(data: DisburseDto): Promise<any> {
    const groupUuids =
      (data?.groups && data?.groups.length) > 0
        ? data.groups
        : await this.getDisbursableGroupsUuids();

    if (groupUuids.length === 0) {
      this.logger.warn('No groups found for disbursement');
      return {
        message: 'No groups found for disbursement',
        groups: [],
      };
    }

    const groups = await this.getGroupsFromUuid(groupUuids);

    console.log(groups);

    this.evmQueue.addBulk(
      groups.map(({ uuid, tokensReserved }) => ({
        name: JOBS.EVM.ASSIGN_TOKENS,
        data: {
          dName: `${tokensReserved.title.toLocaleLowerCase()}_${data.dName}`,
          groups: uuid,
        },
        opts: {
          attempts: 3,
          delay: 2000,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }))
    );

    this.logger.log(`Adding disbursement jobs ${groups.length} groups`);

    return {
      message: `Disbursement jobs added for ${groups.length} groups`,
      groups: groups.map((group) => ({
        uuid: group.uuid,
        status: 'PENDING',
      })),
    };
  }

  async getDisbursementStats() {
    const subgraphUrl = await this.settingsService.getPublic('SUBGRAPH_URL');

    const response = await querySubgraph(
      subgraphUrl.value as string,
      getBeneficiaryAdded({ first: 10, skip: 0 })
    );

    return {
      tokenStats: [
        {
          name: 'Remaining Balance',
          amount: response.benTokensAssigneds.length.toLocaleString(),
        },
        { name: 'Token Price', amount: 'Rs 10' },
      ],
      transactionStats: response.benTokensAssigneds.map((item) => ({
        title: item.id,
        subtitle: item.beneficiary,
        date: new Date(item.blockTimestamp * 1000),
        amount: Number(item.amount).toFixed(0),
        amtColor: 'green',
        hash: item.transactionHash,
      })),
    };
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
    return this.evmQueue.add(JOBS.CONTRACT.FUND_ACCOUNT, {
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
        EvmChainService.name
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize EVM provider: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  private async getChainConfig(): Promise<EVMChainConfig> {
    try {
      const settings = await this.settingsService.getPublic('CHAIN_SETTINGS');
      if (!settings?.value) {
        throw new Error('CHAIN_SETTINGS not found in settings');
      }

      const config = settings.value as unknown as EVMChainConfig;

      // Validate required fields
      const requiredFields = ['rpcUrl', 'chainId'];

      for (const field of requiredFields) {
        if (!config[field as keyof EVMChainConfig]) {
          throw new Error(`Missing required field ${field} in CHAIN_SETTINGS`);
        }
      }
      console.log(config);
      return config;
    } catch (error) {
      this.logger.error(
        `Error getting chain config: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  private async getDisbursableGroupsUuids() {
    const benGroups = await this.prisma.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          {
            numberOfTokens: {
              gt: 0,
            },
          },
          { isDisbursed: false },
          {
            payout: {
              is: null,
            },
          },
        ],
      },
      select: { uuid: true, groupId: true },
    });
    return benGroups.map((group) => group.groupId);
  }

  private async getGroupsFromUuid(uuids: string[]) {
    if (!uuids || !uuids.length) {
      this.logger.warn('No UUIDs provided for group retrieval');
      return [];
    }
    const groups = await this.prisma.beneficiaryGroups.findMany({
      where: {
        uuid: {
          in: uuids,
        },
      },
      include: {
        tokensReserved: true,
      },
    });

    return groups;
  }
}
