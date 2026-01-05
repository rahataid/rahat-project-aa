import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StellarService } from '../../stellar/stellar.service';
import { SettingsService } from '@rumsan/settings';
import { BQUEUE, CORE_MODULE, JOBS } from '../../constants';
import {
  IChainService,
  ChainType,
  AssignTokensDto,
  DisburseDto,
  FundAccountDto,
  SendOtpDto,
  TransferTokensDto,
  VerifyOtpDto,
  AddTriggerDto,
  UpdateTriggerDto,
} from '../interfaces/chain-service.interface';
import { lastValueFrom } from 'rxjs';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import bcrypt from 'bcryptjs';
import { IDisbursement, ReceiveService } from '@rahataid/stellar-sdk';
import { SendAssetDto } from '../../stellar/dto/send-otp.dto';
import { getFormattedTimeDiff } from '../../utils/date';

@Injectable()
export class StellarChainService implements IChainService {
  private readonly logger = new Logger(StellarChainService.name);

  constructor(
    @InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
    private readonly prisma: PrismaService,
    private stellarService: StellarService,
    private settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private receiveService: ReceiveService,
    private settingService: SettingsService
  ) {}

  getChainType(): ChainType {
    return 'stellar';
  }

  validateAddress(address: string): boolean {
    // Stellar addresses are 56 characters long and start with 'G'
    return address.length === 56 && address.startsWith('G');
  }

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // Transform common DTO to stellar-specific format
    const stellarData = {
      walletAddress: data.beneficiaryAddress,
      secretKey: data.metadata?.secretKey,
      amount: data.amount,
    };

    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarData);
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    // For Stellar, token transfers are typically handled through disbursements
    const disbursementData = {
      beneficiaries: [data.toAddress],
      amounts: [data.amount],
      metadata: data,
    };

    return 'ok';
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

    this.logger.log(`Adding disbursement jobs ${groups.length} groups`);

    this.stellarQueue.addBulk(
      groups.map(({ uuid, tokensReserved }) => ({
        name: JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE,
        data: {
          dName: `${tokensReserved.title.toLocaleLowerCase()}_${data.dName}`,
          groups: [uuid],
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

    return {
      message: `Disbursement jobs added for ${groups.length} groups`,
      groups: groups.map((group) => ({
        uuid: group,
        status: 'PENDING',
      })),
    };
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    // const payoutType = await this.getBeneficiaryPayoutTypeByPhone(
    //   sendOtpDto.phoneNumber
    // );

    // if (payoutType.type != 'VENDOR') {
    //   throw new RpcException('Payout type is not VENDOR');
    // }

    // if (payoutType.mode === 'OFFLINE') {
    //   throw new RpcException('Payout mode is not ONLINE');
    // }

    return this.sendOtpByPhone(sendOtpDto);
  }

  async sendAssetToVendor(verifyOtpDto: SendAssetDto) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: {
          walletAddress: verifyOtpDto.receiverAddress,
        },
      });

      if (!vendor) {
        throw new RpcException('Vendor not found');
      }

      const amount =
        verifyOtpDto?.amount ||
        (await this.getBenTotal(verifyOtpDto?.phoneNumber));

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
        throw new RpcException('Beneficiary address not found');
      }

      const result = await this.receiveService.sendAsset(
        keys.privateKey,
        verifyOtpDto.receiverAddress,
        amount.toString()
      );

      if (!result) {
        throw new RpcException(
          `Token transfer to ${verifyOtpDto.receiverAddress} failed`
        );
      }

      this.logger.log(`Transfer successful: ${result.tx.hash}`);

      // Find and update the existing BeneficiaryRedeem record
      const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
        where: {
          beneficiaryWalletAddress: keys.publicKey,
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
          txHash: result.tx.hash,
          isCompleted: true,
          status: 'COMPLETED',
        },
      });

      return {
        txHash: result.tx.hash,
      };
    } catch (error) {
      throw new RpcException(
        error ? error : 'Transferring asset to vendor failed'
      );
    }
  }

  async getDisbursementStats() {
    const oneTokenPrice = (await this.getFromSettings('ONE_TOKEN_PRICE')) ?? 1;
    const tokenName = (await this.getFromSettings('ASSETCODE')) ?? 'RAHAT';

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
      disbursementsInfo.reduce((acc, time) => acc + time, 0) /
      disbursementsInfo.length;

    const activityActivationTime = await this.getActivityActivationTime();
    let averageDuration = 0;

    if (activityActivationTime) {
      averageDuration =
        benfTokens
          .filter((b) => b.isDisbursed && (b.info as any)?.disbursement)
          .reduce((acc, token) => {
            const info = JSON.parse(JSON.stringify(token.info)) as {
              disbursement: IDisbursement;
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
          }, 0) /
        benfTokens.filter((b) => b.isDisbursed && (b.info as any)?.disbursement)
          .length;

      averageDuration = averageDuration;
    }

    return [
      {
        name: 'Token Disbursed',
        value: totalDisbursedTokens,
      },
      {
        name: 'Budget Assigned',
        value: totalTokens * oneTokenPrice,
      },
      {
        name: 'Token',
        value: tokenName,
      },
      { name: 'Token Price', value: oneTokenPrice },
      { name: 'Total Beneficiaries', value: totalBeneficiaries },
      {
        name: 'Average Disbursement time',
        value: getFormattedTimeDiff(averageDisbursementTime),
      },
      {
        name: 'Average Duration',
        value:
          averageDuration !== 0 ? getFormattedTimeDiff(averageDuration) : 'N/A',
      },
    ];
  }

  async getActivityActivationTime() {
    const projectInfo = await this.settingService.getPublic('PROJECTINFO');

    if (!projectInfo) {
      throw new RpcException('Project info not found, in SETTINGS');
    }
    const activeYear = projectInfo?.value?.['active_year'];
    const riverBasin = projectInfo?.value?.['river_basin'];

    if (!activeYear || !riverBasin) {
      this.logger.warn(`Active year or river basin not found, in SETTINGS`);

      return null;
    }

    const data = await lastValueFrom(
      this.client.send(
        { cmd: 'ms.jobs.phases.getAll' },
        {
          activeYear,
          riverBasin,
        }
      )
    );

    const activationPhase = data.data.find((p) => p.name === 'ACTIVATION');

    if (!activationPhase) {
      this.logger.warn(
        `Activation phase not found for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return null;
    }

    if (!activationPhase.isActive) {
      this.logger.warn(
        `Activation phase is not active for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return null;
    }

    return activationPhase.activatedAt;
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

  private async sendOtpByPhone(sendOtpDto: SendOtpDto) {
    const beneficiaryRahatAmount = await this.getBenTotal(
      sendOtpDto?.phoneNumber
    );

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

  private async getBenTotal(phoneNumber: string) {
    try {
      const keys = await this.getSecretByPhone(phoneNumber);
      this.logger.log('Keys: ', keys);
      return this.getRahatBalance(keys.address);
    } catch (error) {
      throw new RpcException(error);
    }
  }

  private async getSecretByPhone(phoneNumber: string) {
    try {
      const ben = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
          { phoneNumber, chain: 'stellar' }
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

  public async getRahatBalance(keys) {
    try {
      const accountBalances = await this.receiveService.getAccountBalance(keys);

      const assetCode = await this.getFromSettings('ASSETCODE');

      const rahatAsset = accountBalances?.find(
        (bal: any) => bal.asset_code === assetCode
      );

      if (!rahatAsset) {
        this.logger.error(`${assetCode} asset not found in account balances`);
        return 0;
      }

      this.logger.log(`${assetCode} asset balance:`, rahatAsset.balance);

      return Math.floor(parseFloat(rahatAsset?.balance || '0'));
    } catch (error) {
      this.logger.error(error.message);
      return 0;
    }
  }

  private async getFromSettings(key: string) {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    return settings?.value[key];
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

  async getBeneficiaryTokenBalance(groupUuids: string[]) {
    if (!groupUuids.length) return [];

    const [groups, tokens] = await Promise.all([
      this.fetchGroupedBeneficiaries(groupUuids),
      this.fetchGroupTokenAmounts(groupUuids),
    ]);

    this.logger.log(`Found ${groups.length} groups`);
    this.logger.log(`Found ${tokens.length} tokens`);

    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  private async fetchGroupedBeneficiaries(groupUuids: string[]) {
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: groupUuids.map((uuid) => ({ uuid })) }
      )
    );

    return response.data ?? [];
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

  private async fetchGroupTokenAmounts(groupUuids: string[]) {
    return this.prisma.beneficiaryGroupTokens.findMany({
      where: { groupId: { in: groupUuids } },
      select: { numberOfTokens: true, groupId: true },
    });
  }

  private computeBeneficiaryTokenDistribution(
    groups: any[],
    tokens: { numberOfTokens: number; groupId: string }[]
  ) {
    const csvData: Record<
      string,
      { phone: string; amount: string; id: string; walletAddress: string }
    > = {};

    this.logger.log(`Computing beneficiary token distribution`);
    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;

      const totalBeneficiaries = group._count?.groupedBeneficiaries;
      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      group.groupedBeneficiaries.forEach(({ Beneficiary }) => {
        const phone = Beneficiary.pii.phone;
        const walletAddress = Beneficiary.walletAddress;
        const amount = tokenPerBeneficiary;

        if (csvData[phone]) {
          csvData[phone].amount = (
            parseFloat(csvData[phone].amount) + amount
          ).toString();
        } else {
          csvData[phone] = {
            phone,
            walletAddress,
            amount: amount.toString(),
            id: Beneficiary.uuid,
          };
        }
      });
    });

    return Object.values(csvData);
  }

  async getDisbursementStatus(id: string): Promise<any> {
    const statusData = {
      disbursementId: id,
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.DISBURSEMENT_STATUS_UPDATE,
      statusData
    );
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    const fundingData = {
      walletAddress: data.walletAddress,
      amount: data.amount,
      secretKey: data.secretKey,
    };

    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, fundingData);
  }

  async checkBalance(address: string): Promise<any> {
    const walletData = { address: address, walletAddress: address };
    return this.stellarService.getWalletStats(walletData);
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    const verificationData = {
      phoneNumber: data.phoneNumber,
      otp: data.otp,
      amount: data.transactionData.amount?.toString() || '0',
      receiverAddress: data.transactionData.vendorAddress,
    };

    return this.stellarService.sendAssetToVendor(verificationData);
  }

  async addTrigger(data: AddTriggerDto): Promise<any> {
    const triggerData = {
      triggers: [data], // Stellar processor expects array of triggers
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE,
      triggerData
    );
  }

  async updateTrigger(data: UpdateTriggerDto): Promise<any> {
    const updateData = {
      id: data.id,
      params: data.params,
      source: data.source,
      isTriggered: data.isTriggered,
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE,
      updateData
    );
  }
}
