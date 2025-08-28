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
import { SendAssetDto } from '../../stellar/dto/send-otp.dto';
import { RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';

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
    const chainConfig = await this.getChainConfig();

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
        title: `Token Assignment - ${item.beneficiary.slice(
          0,
          8
        )}...${item.beneficiary.slice(-6)}`,
        subtitle: item.beneficiary,
        date: new Date(item.blockTimestamp * 1000),
        amount: Number(item.amount).toFixed(0),
        amtColor: 'green',
        hash: item.transactionHash,
      })),
      chainInfo: {
        name: chainConfig.name,
        chainId: chainConfig.chainId,
        rpcUrl: chainConfig.rpcUrl,
        explorerUrl: chainConfig.explorerUrl,
        currencyName: chainConfig.currencyName,
        currencySymbol: chainConfig.currencySymbol,
        currencyDecimals: chainConfig.currencyDecimals,
        projectContractAddress: chainConfig.projectContractAddress,
        tokenContractAddress: chainConfig.tokenContractAddress,
      },
    };
  }

  async getDisbursementStatus(id: string): Promise<any> {
    return this.getTransactionStatus(id);
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<any> {
    return this.sendOtpByPhone(sendOtpDto);
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

      const result = await this.transferTokensEVM(
        keys.privateKey,
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
      throw new RpcException(
        error ? error : 'Transferring asset to vendor failed'
      );
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

      const tokenContract = new ethers.Contract(
        chainConfig.tokenContractAddress,
        [
          'function transfer(address to, uint256 amount) returns (bool)',
          'function balanceOf(address account) view returns (uint256)',
        ],
        wallet
      );

      // Check balance before transfer
      const balance = await tokenContract.balanceOf(wallet.address);
      const transferAmount = ethers.parseUnits(amount, 18);

      if (balance < transferAmount) {
        throw new Error(
          `Insufficient balance. Required: ${amount}, Available: ${ethers.formatUnits(
            balance,
            18
          )}`
        );
      }

      // Transfer tokens
      const tx = await tokenContract.transfer(toAddress, transferAmount);
      const receipt = await tx.wait();

      this.logger.log(
        `Successfully transferred ${amount} tokens from ${wallet.address} to ${toAddress}. Transaction: ${receipt.hash}`
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: wallet.address,
        to: toAddress,
        amount,
      };
    } catch (error) {
      this.logger.error(
        `Error in EVM transfer tokens: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  private async sendOtpByPhone(sendOtpDto: SendOtpDto) {
    const beneficiaryRahatAmount = sendOtpDto.amount;

    const amount = sendOtpDto?.amount || beneficiaryRahatAmount;

    if (Number(amount) > Number(beneficiaryRahatAmount)) {
      throw new RpcException('Amount is greater than rahat balance');
    }

    if (Number(amount) <= 0) {
      throw new RpcException('Amount must be greater than 0');
    }

    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.otp.send_otp' },
        { phoneNumber: sendOtpDto.phoneNumber, amount }
      )
    );

    // Get beneficiary wallet address
    const keys = await this.getSecretByPhone(sendOtpDto.phoneNumber);
    if (!keys) {
      throw new RpcException('Beneficiary address not found');
    }

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
        },
      });
    }

    return this.storeOTP(res.otp, sendOtpDto.phoneNumber, amount as number);
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
