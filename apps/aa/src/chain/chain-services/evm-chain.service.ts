import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import bcrypt from 'bcryptjs';
import { Queue } from 'bull';
import { ethers } from 'ethers';
import { lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, JOBS } from '../../constants';
import { ContractProcessor } from '../../processors/contract.processor';
import { EVMProcessor } from '../../processors/evm.processor';
import { SendAssetDto } from '../../stellar/dto/send-otp.dto';
import {
  AddTriggerDto,
  AssignTokensDto,
  ChainType,
  DisburseDto,
  FundAccountDto,
  IChainService,
  SendOtpDto,
  TransferTokensDto,
  VerifyOtpDto,
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
export class EvmChainService implements IChainService {
  private readonly logger = new Logger(EvmChainService.name);
  private provider: ethers.Provider;
  name = 'evm';
  constructor(
    @InjectQueue(BQUEUE.EVM) private readonly evmQueue: Queue,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EVMProcessor))
    private readonly evmProcessor: EVMProcessor,
    @Inject(forwardRef(() => ContractProcessor))
    private readonly contractProcessor: ContractProcessor
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

  async getDisbursementStats(): Promise<any[]> {
    try {
      this.logger.log(
        'Getting disbursement stats for EVM chain',
        EvmChainService.name
      );

      let oneTokenPrice = 1;
      let tokenName = 'RAHAT';

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

      const benfTokens = await this.prisma.beneficiaryGroupTokens.findMany({
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
      throw new RpcException('Payout not initiated');
    }

    if (payoutType.type != 'VENDOR') {
      this.logger.error('Payout type is not VENDOR');
      throw new RpcException('Payout type is not VENDOR');
    }

    if (payoutType.mode != 'ONLINE') {
      this.logger.error('Payout mode is not ONLINE');
      throw new RpcException('Payout mode is not ONLINE');
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
        throw new RpcException('Vendor not found');
      }

      const amount = verifyOtpDto?.amount;

      this.logger.log(
        `Transferring ${amount} to ${verifyOtpDto.receiverAddress}`
      );

      // await this.verifyOTP(
      //   verifyOtpDto.otp,
      //   verifyOtpDto.phoneNumber,
      //   amount as number
      // );

      const keys = (await this.getSecretByPhone(
        verifyOtpDto.phoneNumber
      )) as any;

      if (!keys) {
        throw new RpcException('Beneficiary address not found');
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
        throw new RpcException(
          'Beneficiary has no tokens available for transfer'
        );
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
        throw new RpcException(
          `Token transfer to ${verifyOtpDto.receiverAddress} failed`
        );
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
        throw new RpcException('No pending BeneficiaryRedeem record found');
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
    const chainConfig = await this.getChainConfig();
    return this.evmQueue.add(JOBS.CONTRACT.FUND_ACCOUNT, {
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
        throw new RpcException(
          'Beneficiary wallet not found for this phone number'
        );
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
      throw new RpcException(`OTP verification failed: ${error.message}`);
    }
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

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({
      where: { phoneNumber },
    });

    if (!record) {
      this.logger.log('OTP record not found');
      throw new RpcException('OTP record not found');
    }

    if (record.isVerified) {
      this.logger.log('OTP already verified');
      throw new RpcException('OTP already verified');
    }

    const now = new Date();
    if (record.expiresAt < now) {
      this.logger.log('OTP has expired');
      throw new RpcException('OTP has expired');
    }

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);

    if (!isValid) {
      this.logger.log('Invalid OTP or amount mismatch');
      throw new RpcException('Invalid OTP or amount mismatch');
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
      throw new RpcException(`Beneficiary with phone ${phoneNumber} not found`);
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
      throw new RpcException('Vendor not found');
    }

    // Get beneficiary wallet address first
    const keys = await this.getSecretByPhone(sendOtpDto.phoneNumber);
    if (!keys) {
      throw new RpcException('Beneficiary address not found');
    }

    let beneficiaryTokenBalance: number;

    const balanceData = await this.evmProcessor.getWalletBalance(keys.address);
    beneficiaryTokenBalance = Number(balanceData.balance);

    if (!beneficiaryTokenBalance) {
      throw new RpcException('Beneficiary token balance not found');
    }

    this.logger.log(
      `Retrieved beneficiary token balance from blockchain: ${beneficiaryTokenBalance}`,
      EvmChainService.name
    );

    // Use the amount from DTO or the blockchain balance
    const amount = sendOtpDto?.amount || beneficiaryTokenBalance;

    // Validate amount
    if (Number(amount) > beneficiaryTokenBalance) {
      throw new RpcException(
        `Requested amount ${amount} is greater than available token balance ${beneficiaryTokenBalance}`
      );
    }

    if (Number(amount) <= 0) {
      throw new RpcException('Amount must be greater than 0');
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
      throw new RpcException(
        'Beneficiary has no tokens available for redemption'
      );
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
            projectUUID: process.env.PROJECT_UUID,
          }
        )
      );

      if (!beneficiary) {
        this.logger.error('Beneficiary not found');
        throw new RpcException('Beneficiary not found');
      }

      // Filter groupedBeneficiaries to only payout-eligible groups (not COMMUNICATION)
      const payoutEligibleGroups = beneficiary.groupedBeneficiaries.filter(
        (g) => g.groupPurpose !== 'COMMUNICATION'
      );

      if (!payoutEligibleGroups.length) {
        this.logger.error('No payout-eligible group found for beneficiary');
        throw new RpcException(
          'No payout-eligible group found for beneficiary'
        );
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
        this.logger.error('Beneficiary group not found');
        throw new RpcException('Beneficiary group not found');
      }

      if (!beneficiaryGroups.tokensReserved) {
        this.logger.error('Tokens not reserved for the group');
        throw new RpcException('Tokens not reserved for the group');
      }

      return beneficiaryGroups.tokensReserved.payout;
    } catch (error) {
      throw new RpcException(
        `Failed to retrieve payout type: ${error.message}`
      );
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
}
