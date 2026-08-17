import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import bcrypt from 'bcryptjs';
import { Queue } from 'bull';
import { ethers } from 'ethers';
import { lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, JOBS } from '../../constants';
import type { ContractProcessor } from '../../processors/contract.processor';
import type { EVMCentralizedProcessor } from '../../processors/evm-centralized.processor';
import {
  AddTriggerDto,
  AssignTokensDto,
  ChainType,
  DisburseDto,
  FundAccountDto,
  IChainService,
  RedeemInkindDto,
  RedeemInkindTokenForCashDto,
  SendAssetDto,
  SendOtpDto,
  TransferTokensDto,
  VerifyOtpDto,
  OfflineTransferItem,
  OfflineTransferResult,
} from '../interfaces/chain-service.interface';

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
export class EvmChainService implements IChainService, OnModuleInit {
  private readonly logger = new Logger(EvmChainService.name);
  private provider: ethers.Provider;
  private _evmProcessor?: EVMCentralizedProcessor;
  private _contractProcessor?: ContractProcessor;
  name = 'evm';

  constructor(
    @InjectQueue(BQUEUE.EVM_TX) private readonly evmTxQueue: Queue,
    @InjectQueue(BQUEUE.EVM_QUERY) private readonly evmQueryQueue: Queue,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef
  ) {}

  async onModuleInit() {
    const chainSettings = await this.settingsService.getPublic(
      'CHAIN_SETTINGS'
    );
    const chainType = (chainSettings?.value as Record<string, unknown>)?.type;
    if (typeof chainType === 'string' && chainType.toLowerCase() !== 'evm') {
      this.logger.log(
        `Chain type is "${chainType}", skipping EVM provider initialization`,
        EvmChainService.name
      );
      return;
    }
    await this.initializeProvider().catch((err) =>
      this.logger.error(
        `Failed to initialize EVM provider: ${err.message}`,
        err.stack,
        EvmChainService.name
      )
    );
  }

  private get evmProcessor(): EVMCentralizedProcessor {
    if (!this._evmProcessor) {
      // To prevent circular dependency issues, we are using dynamic import and moduleRef to get the processor instance.
      const mod = require('../../processors/evm-centralized.processor');
      this._evmProcessor = this.moduleRef.get(mod.EVMCentralizedProcessor, {
        strict: false,
      });
    }
    return this._evmProcessor;
  }

  private get contractProcessor(): ContractProcessor {
    if (!this._contractProcessor) {
      // To prevent circular dependency issues, we are using dynamic import and moduleRef to get the processor instance.
      const mod = require('../../processors/contract.processor');
      this._contractProcessor = this.moduleRef.get(mod.ContractProcessor, {
        strict: false,
      });
    }
    return this._contractProcessor;
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

      const job = await this.evmTxQueue.add(
        {
          type: JOBS.CONTRACT.DISBURSE_BATCH,
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
    throw new RpcException({
      message: 'EVM triggers not implemented yet',
      code: 'EVM_TRIGGERS_NOT_IMPLEMENTED',
    });
  }

  async updateTriggerParams(triggerUpdate: any): Promise<any> {
    // EVM triggers are not implemented yet - throw error for now
    throw new RpcException({
      message: 'EVM triggers not implemented yet',
      code: 'EVM_TRIGGERS_NOT_IMPLEMENTED',
    });
  }

  async addBeneficiary(beneficiaryAddress: string): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();

      const job = await this.evmTxQueue.add(
        {
          type: JOBS.CONTRACT.ADD_BENEFICIARY,
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

      const job = await this.evmQueryQueue.add({
        type: JOBS.CONTRACT.CHECK_BALANCE,
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
    this.logger.log(
      `Assigning ${data.amount} tokens to ${data.beneficiaryAddress}`
    );
    const chainConfig = await this.getChainConfig();
    return this.evmTxQueue.add({
      type: JOBS.CONTRACT.ASSIGN_TOKENS,
      beneficiaryAddress: data.beneficiaryAddress,
      amount: data.amount.toString(),
      projectContract: chainConfig.projectContractAddress,
    });
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    throw new RpcException({
      message: 'Transfer tokens not implemented for EVM',
      code: 'TRANSFER_TOKENS_NOT_IMPLEMENTED_FOR_EVM',
    });
  }

  async preDisburse(_data: DisburseDto): Promise<any> {
    throw new RpcException({
      message: 'Disburse-on-create not supported on EVM chain',
      code: 'CHAIN_DISBURSE_ON_CREATE_UNSUPPORTED',
      params: { chainType: 'EVM' },
    });
  }

  async disburse(data: DisburseDto): Promise<any> {
    this.logger.log(
      `Starting disbursement for ${data.dName} with groups: ${data.groups}`
    );
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
    this.logger.log(
      `Found ${groupUuids.length} groups for disbursement: ${groupUuids.join(
        ', '
      )}`
    );

    const groups = await this.getGroupsFromUuid(groupUuids);

    this.logger.log(`Resolved groups to addresses for ${groups.length} groups`);

    // const jobs = await this.evmTxQueue.add(
    //   groups.map(({ uuid, tokensReserved }) => ({
    //     data: {
    //       type: JOBS.EVM.ASSIGN_TOKENS,
    //       dName: `${tokensReserved.title.toLocaleLowerCase()}_${data.dName}`,
    //       groups: uuid,
    //     },
    //     opts: {
    //       attempts: 3,
    //       delay: 2000,
    //       removeOnComplete: true,
    //       backoff: {
    //         type: 'exponential',
    //         delay: 1000,
    //       },
    //     },
    //   }))
    // );

    let count = 0;
    for (const { uuid, tokensReserved } of groups) {
      const activeToken = tokensReserved.find((t) => t.isDisbursed === false);
      if (!activeToken) {
        this.logger.warn(
          `Group ${uuid} has no active token reservation, skipping`
        );
        continue;
      }
      this.logger.log(`loop counter: ${count++}`);
      this.logger.log(
        `Adding disbursement job for group ${uuid} with ${activeToken.numberOfTokens} tokens reserved`
      );
      await this.evmTxQueue.add(
        {
          type: JOBS.EVM.ASSIGN_TOKENS,
          dName: `${activeToken.title.toLocaleLowerCase()}_${data.dName}`,
          groups: uuid,
        },
        {
          attempts: 3,
          delay: 2000,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        }
      );
    }

    this.logger.log(
      `Added ${groups.length} disbursement jobs to EVM TX queue for ${groups.length} groups`
    );

    return {
      message: `Disbursement jobs added for ${groups.length} groups`,
      groups: groups.map((group) => ({
        uuid: group.uuid,
        status: 'PENDING',
      })),
    };
  }

  async getDisbursementStats(payload: {
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    try {
      this.logger.log(
        'Getting disbursement stats for EVM chain',
        EvmChainService.name
      );

      let oneTokenPrice = 1;
      let tokenName = 'RAHAT';
      let tokenBalance;

      try {
        const tokenPriceSetting = await this.settingsService.getPublic(
          'ONE_TOKEN_PRICE'
        );
        oneTokenPrice = Number(tokenPriceSetting?.value) || 1;
      } catch (error) {
        this.logger.warn(
          'ONE_TOKEN_PRICE setting not found, using default value: 1',
          EvmChainService.name
        );
      }

      try {
        const tokenNameSetting = await this.settingsService.getPublic(
          'ASSETCODE'
        );
        tokenName = String(tokenNameSetting?.value) || 'RAHAT';
      } catch (error) {
        this.logger.warn(
          'ASSETCODE setting not found, using default value: RAHAT',
          EvmChainService.name
        );
      }

      try {
        const contract = await this.settingsService.getPublic('CONTRACT');
        const tokenAddress = (contract?.value as any)?.RAHATTOKEN?.ADDRESS;
        const projectAddress = (contract?.value as any)?.AAPROJECT?.ADDRESS;

        tokenBalance = await this.evmProcessor.getRahatTokenBalance(
          projectAddress
        );
      } catch (err) {
        this.logger.warn('Contract details not found');
      }

      const dateFilter =
        payload?.startDate || payload?.endDate
          ? {
              createdAt: {
                ...(payload?.startDate && { gte: new Date(payload.startDate) }),
                ...(payload?.endDate && { lte: new Date(payload.endDate) }),
              },
            }
          : {};

      const benfTokens = await this.prisma.beneficiaryGroupTokens.findMany({
        where: {
          ...dateFilter,
        },
        include: {
          beneficiaryGroup: {
            include: {
              _count: {
                select: {
                  beneficiaries: true,
                },
              },
            },
          },
        },
      });

      // Apply date filter to beneficiaryRedeem for token stats
      const redeemDateFilter =
        payload?.startDate || payload?.endDate
          ? {
              createdAt: {
                ...(payload?.startDate && { gte: new Date(payload.startDate) }),
                ...(payload?.endDate && { lte: new Date(payload.endDate) }),
              },
            }
          : {};

      const tokenStatsResult = await this.getTokenStats(redeemDateFilter);

      const totalDisbursedTokens = benfTokens.reduce((acc, token) => {
        if (token.isDisbursed) {
          acc += token.numberOfTokens;
        }
        return acc;
      }, 0);

      const totalTokens = benfTokens.reduce(
        (acc, token) => acc + token.numberOfTokens,
        0
      );

      const totalBeneficiaries = benfTokens
        .filter((token) => token.isDisbursed)
        .reduce(
          (acc, token) => acc + token.beneficiaryGroup._count.beneficiaries,
          0
        );

      const disbursementsInfo = benfTokens
        .filter(
          (token) =>
            token.isDisbursed && (token.info as any)?.disbursementTimeTaken
        )
        .map((token) => (token.info as any)?.disbursementTimeTaken);

      const averageDisbursementTime =
        disbursementsInfo.length > 0
          ? disbursementsInfo.reduce((acc, time) => acc + time, 0) /
            disbursementsInfo.length
          : 0;

      const activityActivationTime = await this.getActivityActivationTime();
      let averageDuration = 0;

      if (activityActivationTime) {
        const disbursedTokensWithInfo = benfTokens.filter(
          (b) => b.isDisbursed && (b.info as any)?.disbursement
        );

        if (disbursedTokensWithInfo.length > 0) {
          averageDuration =
            disbursedTokensWithInfo.reduce((acc, token) => {
              const info = JSON.parse(JSON.stringify(token.info)) as {
                disbursement: any;
              };
              // getting disbursement completion time
              const {
                disbursement: { updated_at },
              } = info;

              // diff between disbursement completion time and activity activation time
              const timeTaken =
                new Date(updated_at).getTime() -
                new Date(activityActivationTime).getTime();

              return acc + timeTaken;
            }, 0) / disbursedTokensWithInfo.length;
        }
      }

      return [
        {
          name: 'Token Disbursed',
          value: totalDisbursedTokens,
        },
        {
          name: 'Available balance',
          value: tokenBalance?.balance,
        },
        {
          name: 'Budget Assigned',
          value: totalTokens * Number(oneTokenPrice),
        },
        {
          name: 'Token',
          value: tokenName,
        },
        { name: 'Token Price', value: oneTokenPrice },
        { name: 'Total Beneficiaries', value: totalBeneficiaries },
        {
          name: 'Average Disbursement time',
          value: this.getFormattedTimeDiff(averageDisbursementTime),
        },
        {
          name: 'Average Duration',
          value:
            averageDuration !== 0
              ? this.getFormattedTimeDiff(averageDuration)
              : 'N/A',
        },
        {
          name: 'Assigned Tokens',
          value: tokenStatsResult.assignedTokens,
        },
        {
          name: 'Disbursed Tokens',
          value: tokenStatsResult.disbursedTokens,
        },
        {
          name: 'Pending Disbursement',
          value: tokenStatsResult.pendingDisbursement,
        },
        {
          name: 'Redeemed Tokens',
          value: tokenStatsResult.redeemedTokens,
        },
      ];
    } catch (error) {
      this.logger.error(
        `Error getting disbursement stats: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  private async getTokenStats(dateFilter?: any) {
    const REDEEMED_LEGS = [
      { transactionType: 'VENDOR_REIMBURSEMENT', status: 'COMPLETED' },
      {
        transactionType: 'FIAT_TRANSFER',
        status: 'FIAT_TRANSACTION_COMPLETED',
      },
    ] as const;
    let assignedTokens = 0;
    let disbursedTokens = 0;
    let redeemedTokens = 0;

    const groupTokens = await this.prisma.beneficiaryGroupTokens.findMany({
      where: dateFilter,
      select: {
        numberOfTokens: true,
        isDisbursed: true,
        payout: { select: { type: true, mode: true } },
      },
    });
    for (const gt of groupTokens) {
      const tokens = gt.numberOfTokens || 0;
      assignedTokens += tokens;
      if (gt.isDisbursed) disbursedTokens += tokens;
    }
    const pendingDisbursement = assignedTokens - disbursedTokens;

    const redeemRecords = await this.prisma.beneficiaryRedeem.findMany({
      where: { OR: [...REDEEMED_LEGS], ...dateFilter },
      select: {
        amount: true,
        transactionType: true,
        beneficiaryWalletAddress: true,
        payout: { select: { mode: true } },
      },
    });

    for (const r of redeemRecords) {
      redeemedTokens += r.amount;
    }
    const result = {
      assignedTokens,
      disbursedTokens,
      pendingDisbursement,
      redeemedTokens,
    };
    return result;
  }

  /**
   * Get activity activation time from project settings
   * @returns Promise<string | null> - Activity activation time or null
   */
  private async getActivityActivationTime(): Promise<string | null> {
    try {
      const projectInfo = await this.settingsService.getPublic('PROJECTINFO');
      return (projectInfo?.value as any)?.activityActivationTime || null;
    } catch (error) {
      this.logger.warn(
        'PROJECTINFO setting not found, activity activation time will be null',
        EvmChainService.name
      );
      return null;
    }
  }

  /**
   * Format time difference in a human-readable format
   * @param timeInMs - Time in milliseconds
   * @returns string - Formatted time difference
   */
  private getFormattedTimeDiff(timeInMs: number): string {
    if (!timeInMs || timeInMs === 0) return 'N/A';

    const seconds = Math.floor(timeInMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async getDisbursementStatus(id: string): Promise<any> {
    return this.getTransactionStatus(id);
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<any> {
    const payoutType = await this.getBeneficiaryPayoutTypeByPhone(
      sendOtpDto.phoneNumber
    );

    if (!payoutType) {
      this.logger.error('Payout not initiated');
      throw new RpcException({
        message: 'Payout not initiated',
        code: 'PAYOUT_ERR_SEND_OTP_NOT_INITIATED',
      });
    }

    if (payoutType.type != 'VENDOR') {
      this.logger.error('Payout type is not VENDOR');
      throw new RpcException({
        message: 'Payout type is not VENDOR',
        code: 'PAYOUT_ERR_SEND_OTP_TYPE_NOT_VENDOR',
      });
    }

    if (payoutType.mode != 'ONLINE') {
      this.logger.error('Payout mode is not ONLINE');
      throw new RpcException({
        message: 'Payout mode is not ONLINE',
        code: 'PAYOUT_ERR_SEND_OTP_MODE_NOT_ONLINE',
      });
    }

    return this.sendOtpByPhone(sendOtpDto, payoutType.uuid);
  }

  async sendAssetToVendor(verifyOtpDto: SendAssetDto): Promise<any> {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: {
          walletAddress: verifyOtpDto.receiverAddress,
        },
      });

      if (!vendor) {
        throw new RpcException({ message: 'Vendor not found', code: 'PAYOUT_ERR_VENDOR_NOT_FOUND' });
      }

      const amount = verifyOtpDto?.amount;

      this.logger.log(
        `Transferring ${amount} to ${verifyOtpDto.receiverAddress}`
      );

      await this.verifyOTP(
        verifyOtpDto.otp,
        verifyOtpDto.phoneNumber,
        amount as number
      );

      const keys = (await this.getSecretByPhone(
        verifyOtpDto.phoneNumber
      )) as any;

      if (!keys) {
        throw new RpcException({
          message: 'Beneficiary address not found',
          code: 'PAYOUT_ERR_BENEFICIARY_ADDRESS_NOT_FOUND',
        });
      }

      console.log('keys', keys);
      console.log('verifyOtpDto', verifyOtpDto);
      console.log('amount', amount);

      // Check if beneficiary has tokens in the contract before proceeding with transfer
      const hasTokens = await this.evmProcessor.checkBeneficiaryHasTokens(
        keys.address
      );

      if (!hasTokens) {
        this.logger.warn(
          `Beneficiary ${keys.address} has no tokens in contract. Transfer denied.`,
          EvmChainService.name
        );
        throw new RpcException({
          message: 'Beneficiary has no tokens available for transfer',
          code: 'BENEFICIARY_NO_TOKENS_AVAILABLE',
        });
      }

      this.logger.log(
        `Beneficiary ${keys.address} has tokens. Proceeding with transfer.`,
        EvmChainService.name
      );

      const result = await this.evmProcessor.transferBeneficiaryTokenToVendor(
        keys.address,
        verifyOtpDto.receiverAddress,
        amount.toString()
      );

      if (!result) {
        throw new RpcException({
          message: `Token transfer to ${verifyOtpDto.receiverAddress} failed`,
          code: 'TOKEN_TRANSFER_TO_ADDRESS_FAILED',
          params: { address: verifyOtpDto.receiverAddress },
        });
      }

      this.logger.log(`Transfer successful: ${result.txHash}`);

      // Find and update the existing BeneficiaryRedeem record
      const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
        where: {
          beneficiaryWalletAddress: keys.address,
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!existingRedeem) {
        throw new RpcException({
          message: 'No pending BeneficiaryRedeem record found',
          code: 'NO_PENDING_BENEFICIARY_REDEEM_FOUND',
        });
      }

      // Update the BeneficiaryRedeem record with transaction details
      await this.prisma.beneficiaryRedeem.update({
        where: {
          uuid: existingRedeem.uuid,
        },
        data: {
          vendorUid: vendor.uuid,
          txHash: result.txHash,
          isCompleted: true,
          status: 'COMPLETED',
        },
      });

      return {
        txHash: result.txHash,
      };
    } catch (error) {
      this.logger.error(
        `Error in sendAssetToVendor: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  async transferOfflineRedemptionBatch(
    items: OfflineTransferItem[]
  ): Promise<OfflineTransferResult[]> {
    const results: OfflineTransferResult[] = [];
    for (const item of items) {
      try {
        const result = await this.evmProcessor.transferBeneficiaryTokenToVendor(
          item.beneficiaryWalletAddress,
          item.vendorWalletAddress,
          item.amount.toString()
        );
        results.push({
          beneficiaryWalletAddress: item.beneficiaryWalletAddress,
          txHash: result.txHash,
        });
      } catch (err: any) {
        results.push({
          beneficiaryWalletAddress: item.beneficiaryWalletAddress,
          error: err?.message,
        });
      }
    }
    return results;
  }

  async getWalletBalance(data: { address: string }): Promise<any> {
    try {
      this.logger.log(
        `Getting wallet balance for address: ${data.address}`,
        EvmChainService.name
      );

      // Delegate to EVM processor for getting wallet balance
      const balance = await this.evmProcessor.getWalletBalance(data.address);

      this.logger.log(
        `Successfully retrieved balance for ${data.address}: ${balance.balance}`,
        EvmChainService.name
      );

      return balance;
    } catch (error) {
      this.logger.error(
        `Error getting wallet balance for ${data.address}: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  async getRahatTokenBalance(data: { address: string }): Promise<any> {
    try {
      this.logger.log(
        `Getting RahatToken balance for address: ${data.address}`,
        EvmChainService.name
      );

      // Delegate to EVM processor for getting RahatToken balance
      const balance = await this.evmProcessor.getRahatTokenBalance(
        data.address
      );

      this.logger.log(
        `Successfully retrieved RahatToken balance for ${data.address}: ${balance.balance}`,
        EvmChainService.name
      );

      return balance;
    } catch (error) {
      this.logger.error(
        `Error getting RahatToken balance for ${data.address}: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw error;
    }
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    this.logger.log(
      `Funding account ${data.walletAddress} with amount ${data.amount}`
    );
    const chainConfig = await this.getChainConfig();
    return this.evmTxQueue.add({
      type: JOBS.CONTRACT.FUND_ACCOUNT,
      walletAddress: data.walletAddress,
      amount: data.amount,
    });
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    try {
      this.logger.log(
        `Verifying OTP for phone: ${data.phoneNumber}`,
        EvmChainService.name
      );

      // Get beneficiary wallet address from phone number
      const keys = await this.getSecretByPhone(data.phoneNumber);

      if (!keys || !keys.address) {
        throw new RpcException({
          message: 'Beneficiary wallet not found for this phone number',
          code: 'BENEFICIARY_WALLET_NOT_FOUND_FOR_PHONE',
        });
      }

      // Proceed with OTP verification
      // Extract amount from transactionData or use a default value
      const amount = data.transactionData?.amount || 0;
      await this.verifyOTP(data.otp, data.phoneNumber, amount);

      return {
        success: true,
        message: 'OTP verified successfully',
        beneficiaryAddress: keys.address,
      };
    } catch (error) {
      this.logger.error(
        `Error in verifyOtp: ${error.message}`,
        error.stack,
        EvmChainService.name
      );
      throw new RpcException({
        message: `OTP verification failed: ${error.message}`,
        code: 'STELLAR_ERR_OTP_VERIFY_FAILED',
      });
    }
  }

  validateAddress(address: string): boolean {
    const isValid = ethers.isAddress(address);
    this.logger.debug(`Address validation for ${address}: ${isValid}`);
    return isValid;
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
        throw new RpcException({
          message: 'Invalid group resolution response',
          code: 'INVALID_GROUP_RESOLUTION_RESPONSE',
        });
      }

      return {
        beneficiaries: resolvedData.beneficiaries.map(
          (b: any) => b.walletAddress
        ),
        amounts: resolvedData.beneficiaries.map(
          (b: any) => b.tokenAmount?.toString() || '0'
        ),
      };
    } catch (error: any) {
      this.logger.error(
        `Error resolving groups: ${error.message}`,
        error.stack
      );
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        message: `Failed to resolve groups to addresses: ${error.message}`,
        code: 'FAILED_TO_RESOLVE_GROUPS_TO_ADDRESSES',
        params: { message: error.message },
      });
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
        throw new RpcException({
          message: 'CHAIN_SETTINGS not found in settings',
          code: 'CHAIN_SETTINGS_NOT_FOUND',
        });
      }

      const config = settings.value as unknown as EVMChainConfig;

      // Validate required fields
      const requiredFields = ['rpcUrl', 'chainId'];

      for (const field of requiredFields) {
        if (!config[field as keyof EVMChainConfig]) {
          throw new RpcException({
            message: `Missing required field ${field} in CHAIN_SETTINGS`,
            code: 'MISSING_REQUIRED_FIELD_IN_CHAIN_SETTINGS',
            params: { field },
          });
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
    this.logger.debug('Fetching disbursable group UUIDs');
    const benGroups = await this.prisma.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          {
            numberOfTokens: {
              gt: 0,
            },
          },
          { isDisbursed: false },
        ],
      },
      select: { uuid: true, groupId: true },
    });
    this.logger.debug(`Found ${benGroups.length} disbursable groups`);
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

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({
      where: { phoneNumber },
    });

    if (!record) {
      this.logger.log('OTP record not found');
      throw new RpcException({
        message: 'OTP record not found',
        code: 'OTP_RECORD_NOT_FOUND',
      });
    }

    if (record.isVerified) {
      this.logger.log('OTP already verified');
      throw new RpcException({
        message: 'OTP already verified',
        code: 'OTP_ALREADY_VERIFIED',
      });
    }

    const now = new Date();
    if (record.expiresAt < now) {
      this.logger.log('OTP has expired');
      throw new RpcException({ message: 'OTP has expired', code: 'OTP_EXPIRED' });
    }

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);

    if (!isValid) {
      this.logger.log('Invalid OTP or amount mismatch');
      throw new RpcException({
        message: 'Invalid OTP or amount mismatch',
        code: 'INVALID_OTP_OR_AMOUNT_MISMATCH',
      });
    }

    this.logger.log('OTP verified successfully');
    await this.prisma.otp.update({
      where: { phoneNumber },
      data: { isVerified: true },
    });

    return true;
  }

  // private async getBenTotal(phoneNumber: string) {
  //   try {
  //     const keys = await this.getSecretByPhone(phoneNumber);
  //     this.logger.log('Keys: ', keys);
  //     return this.getRahatBalance(keys.address);
  //   } catch (error) {
  //     throw new RpcException(error);
  //   }
  // }

  private async getSecretByPhone(phoneNumber: string) {
    try {
      const ben = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
          { phoneNumber, chain: 'evm' }
        )
      );
      this.logger.log(`Beneficiary found: ${ben.address}`);
      return ben;
    } catch (error) {
      this.logger.log(
        `Couldn't find secret for phone ${phoneNumber}`,
        error.message
      );
      throw new RpcException({
        message: `Beneficiary with phone ${phoneNumber} not found`,
        code: 'PAYOUT_ERR_BENEFICIARY_PHONE_NOT_FOUND',
        params: { phoneNumber },
      });
    }
  }

  // private async getRahatBalance(address: string) {
  //   try {
  //     const chainConfig = await this.getChainConfig();
  //     const tokenContract = new ethers.Contract(
  //       chainConfig.tokenContractAddress,
  //       ['function balanceOf(address account) view returns (uint256)'],
  //       this.provider
  //     );

  //     console.log('tokenContract', tokenContract);

  //     const balance = await tokenContract.balanceOf(address);

  //     console.log('balance', balance);
  //     return ethers.formatUnits(balance, 18);
  //   } catch (error) {
  //     this.logger.error(`Error getting balance: ${error.message}`);
  //     throw new RpcException('Failed to get balance');
  //   }
  // }

  private async transferTokensEVM(
    privateKey: string,
    toAddress: string,
    amount: string
  ): Promise<any> {
    try {
      const chainConfig = await this.getChainConfig();
      const wallet = new ethers.Wallet(privateKey, this.provider);

      // Get beneficiary wallet address from private key
      const beneficiaryAddress = wallet.address;

      // Create AAProject contract instance using contract processor
      const contractInstance =
        await this.contractProcessor.createContractInstanceSign('AAProject');
      const aaProjectContract = contractInstance.contract;

      // Check beneficiary token balance in AAProject contract
      const beneficiaryBalance = await aaProjectContract.benTokens(
        beneficiaryAddress
      );
      const transferAmount = ethers.parseUnits('10', 18);

      // Transfer tokens using AAProject contract
      const tx = await aaProjectContract.transferTokenToVendor(
        beneficiaryAddress,
        toAddress,
        transferAmount
      );
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from beneficiary ${beneficiaryAddress} to vendor ${toAddress} using AAProject contract. Transaction: ${receipt.hash}`
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: beneficiaryAddress,
        to: toAddress,
        amount,
        method: 'transferTokenToVendor',
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM transfer tokens using AAProject: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  private async sendOtpByPhone(sendOtpDto: SendOtpDto, payoutId: string) {
    // Verify vendor exists
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        uuid: sendOtpDto.vendorUuid,
      },
    });
    if (!vendor) {
      throw new RpcException({ message: 'Vendor not found', code: 'PAYOUT_ERR_VENDOR_NOT_FOUND' });
    }

    // Get beneficiary wallet address first
    const keys = await this.getSecretByPhone(sendOtpDto.phoneNumber);
    if (!keys) {
      throw new RpcException({ message: 'Beneficiary address not found', code: 'PAYOUT_ERR_BENEFICIARY_ADDRESS_NOT_FOUND' });
    }

    let beneficiaryTokenBalance: number;

    const balanceData = await this.evmProcessor.getWalletBalance(keys.address);
    beneficiaryTokenBalance = Number(balanceData.balance);

    if (!beneficiaryTokenBalance) {
      throw new RpcException({ message: 'Beneficiary token balance not found', code: 'STELLAR_ERR_TOKEN_BALANCE_NOT_FOUND' });
    }

    this.logger.log(
      `Retrieved beneficiary token balance from blockchain: ${beneficiaryTokenBalance}`,
      EvmChainService.name
    );

    // Use the amount from DTO or the blockchain balance
    const amount = sendOtpDto?.amount || beneficiaryTokenBalance;

    // Validate amount
    if (Number(amount) > beneficiaryTokenBalance) {
      throw new RpcException({
        message: `Requested amount ${amount} is greater than available token balance ${beneficiaryTokenBalance}`,
        code: 'PAYOUT_ERR_AMOUNT_EXCEEDS_BALANCE',
        params: { amount, balance: beneficiaryTokenBalance },
      });
    }

    if (Number(amount) <= 0) {
      throw new RpcException({ message: 'Amount must be greater than 0', code: 'PAYOUT_ERR_AMOUNT_NOT_POSITIVE' });
    }

    // Check if beneficiary has tokens in the contract before sending OTP
    const hasTokens = await this.evmProcessor.checkBeneficiaryHasTokens(
      keys.address
    );

    if (!hasTokens) {
      this.logger.warn(
        `Beneficiary ${keys.address} has no tokens in contract. OTP sending denied.`,
        EvmChainService.name
      );
      throw new RpcException({
        message: 'Beneficiary has no tokens available for redemption',
        code: 'BENEFICIARY_NO_TOKENS_AVAILABLE',
      });
    }

    this.logger.log(
      `Beneficiary ${keys.address} has tokens. Proceeding with OTP sending.`,
      EvmChainService.name
    );

    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.otp.send_otp' },
        { phoneNumber: sendOtpDto.phoneNumber, amount }
      )
    );

    // Find existing BeneficiaryRedeem record for this beneficiary
    const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
      where: {
        beneficiaryWalletAddress: keys.address,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingRedeem) {
      // Update existing record with new vendor and reset status
      await this.prisma.beneficiaryRedeem.update({
        where: {
          uuid: existingRedeem.uuid,
        },
        data: {
          vendorUid: sendOtpDto.vendorUuid,
          amount: amount as number,
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          payoutId: payoutId,
        },
      });
    } else {
      // Create new record if none exists
      await this.prisma.beneficiaryRedeem.create({
        data: {
          beneficiaryWalletAddress: keys.address,
          amount: amount as number,
          transactionType: 'VENDOR_REIMBURSEMENT',
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          vendorUid: sendOtpDto.vendorUuid,
          payoutId: payoutId,
        },
      });
    }

    return this.storeOTP(res.otp, sendOtpDto.phoneNumber, amount as number);
  }

  private async getBeneficiaryPayoutTypeByPhone(phone: string): Promise<any> {
    try {
      const beneficiary = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
          {
            phone,
            projectUUID: process.env.PROJECT_ID,
          }
        )
      );

      if (!beneficiary) {
        this.logger.error('Beneficiary not found');
        throw new RpcException({ message: 'Beneficiary not found', code: 'PAYOUT_ERR_BENEFICIARY_NOT_FOUND' });
      }

      if (!beneficiary.groupedBeneficiaries) {
        this.logger.error('Beneficiary has no grouped beneficiaries');
        throw new RpcException({
          message: 'Beneficiary has no grouped beneficiaries',
          code: 'BENEFICIARY_NO_GROUPED_BENEFICIARIES',
        });
      }

      // Filter groupedBeneficiaries to only payout-eligible groups (not COMMUNICATION)
      const payoutEligibleGroups = beneficiary.groupedBeneficiaries.filter(
        (g) => g.groupPurpose !== 'COMMUNICATION'
      );

      if (!payoutEligibleGroups.length) {
        this.logger.error('No payout-eligible group found for beneficiary');
        throw new RpcException({
          message: 'No payout-eligible group found for beneficiary',
          code: 'PAYOUT_ERR_NO_ELIGIBLE_GROUP',
        });
      }

      if (payoutEligibleGroups.length > 1) {
        this.logger.warn(
          `Multiple payout-eligible groups found for beneficiary. Using the first one: ${payoutEligibleGroups
            .map((g) => g.beneficiaryGroupId)
            .join(', ')}`
        );
        throw new RpcException({
          message:
            'Multiple payout-eligible groups found for beneficiary. Please contact support.',
          code: 'MULTIPLE_PAYOUT_ELIGIBLE_GROUPS_FOUND',
        });
      }

      // Use the first payout-eligible group for the lookup
      const beneficiaryGroups = await this.prisma.beneficiaryGroups.findUnique({
        where: {
          uuid: payoutEligibleGroups[0].beneficiaryGroupId,
        },
        include: {
          tokensReserved: {
            include: {
              payout: true,
            },
          },
        },
      });

      if (!beneficiaryGroups) {
        this.logger.error(
          `Beneficiary group not found for ID: ${payoutEligibleGroups[0].beneficiaryGroupId}`
        );
        throw new RpcException({ message: 'Beneficiary group not found', code: 'PAYOUT_ERR_GROUP_NOT_FOUND' });
      }

      // Recheck, isDisbursed was false which was opposite of the needed logic, so changed to true to find the active token
      const activeToken = beneficiaryGroups.tokensReserved.find(
        (t) => t.isDisbursed === true
      );

      if (!activeToken) {
        this.logger.error('Tokens not reserved for the group');
        throw new RpcException({ message: 'Tokens not reserved for the group', code: 'PAYOUT_ERR_TOKENS_NOT_RESERVED' });
      }

      return activeToken.payout;
    } catch (error) {
      throw new RpcException({
        message: `Failed to retrieve payout type: ${error.message}`,
        code: 'PAYOUT_ERR_RETRIEVE_TYPE',
        params: { message: error.message },
      });
    }
  }

  private async storeOTP(otp: string, phoneNumber: string, amount: number) {
    const expiresAt = new Date();
    this.logger.log('Expires at: ', expiresAt);
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const otpHash = await bcrypt.hash(`${otp}:${amount}`, 10);
    this.logger.log('OTP hash: ', otpHash);

    const otpRes = await this.prisma.otp.upsert({
      where: {
        phoneNumber,
      },
      update: {
        otpHash,
        amount,
        expiresAt,
        isVerified: false,
        updatedAt: new Date(),
      },
      create: {
        phoneNumber,
        otpHash,
        amount,
        expiresAt,
      },
    });

    delete otpRes.otpHash;

    return otpRes;
  }

  async redeemInkind(redeemDto: RedeemInkindDto) {
    this.logger.log(
      `Redeeming inkind for beneficiary ${redeemDto.beneficiaryAddress}`
    );
    return this.evmTxQueue.add(
      { type: JOBS.EVM.REDEEM_INKIND, ...redeemDto },
      {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
  }

  async redeemVendorInkindTokens(
    redeemVendorInkindDto: RedeemInkindTokenForCashDto
  ) {
    this.logger.log(
      `Redeeming vendor inkind tokens for ${redeemVendorInkindDto.vendorAddress}, amount: ${redeemVendorInkindDto.amount}`
    );
    return this.evmTxQueue.add(
      { type: JOBS.EVM.REDEEM_INKIND_TOKEN_FOR_CASH, ...redeemVendorInkindDto },
      {
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
  }
}
