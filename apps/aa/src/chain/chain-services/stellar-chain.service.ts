import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SettingsService } from '@rumsan/settings';
import { BQUEUE, CORE_MODULE, JOBS } from '../../constants';
import {
  IChainService,
  ChainType,
  AssignTokensDto,
  DisburseDto,
  FundAccountDto,
  SendOtpDto,
  SendAssetDto,
  TransferTokensDto,
  VerifyOtpDto,
  AddTriggerDto,
  UpdateTriggerDto,
  RedeemInkindDto,
  RedeemInkindTokenForCashDto,
  OfflineTransferItem,
  OfflineTransferResult,
} from '../interfaces/chain-service.interface';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { getFormattedTimeDiff } from '../../utils/date';
import { lastValueFrom } from 'rxjs';
import { getBalance } from 'libs/stellar/src/utils/account';
import { StellarClient } from 'libs/stellar/src/client';
import { StellarClientConfig } from 'libs/stellar/src/types';
import bcrypt from 'bcryptjs';

export interface BeneficiaryCsvData {
  phone: string;
  walletAddress: string;
  name: string;
  id: string;
  amount: string;
}

@Injectable()
export class StellarChainService implements IChainService {
  private readonly logger = new Logger(StellarChainService.name);

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SDP) private stellarSdpQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR_SEND_ASSET)
    private stellarSendAssetQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy
  ) {}

  getChainType(): ChainType {
    return 'stellar';
  }

  validateAddress(address: string): boolean {
    return address.length === 56 && address.startsWith('G');
  }

  async disburse(data: DisburseDto): Promise<any> {
    this.logger.log(
      `Starting stellar SDP disbursement for ${data.dName} with groups: ${
        data.groups || 'all'
      }`
    );

    const groupUuids =
      data?.groups && data.groups.length > 0
        ? data.groups
        : await this.getDisbursableGroupsUuids();

    this.logger.debug(
      `Resolved ${groupUuids.length} group UUIDs for disbursement`
    );

    if (groupUuids.length === 0) {
      this.logger.warn('No groups found for disbursement');
      return {
        message: 'No groups found for disbursement',
        groups: [],
      };
    }

    const groups = await this.getGroupsFromUuid(groupUuids);

    this.logger.log(`Adding SDP disbursement jobs for ${groups.length} groups`);

    for (const { uuid, tokensReserved } of groups) {
      const activeToken = tokensReserved.find((t) => t.isDisbursed === false);
      if (!activeToken) {
        this.logger.warn(
          `Group ${uuid} has no active token reservation, skipping`
        );
        continue;
      }

      const existingDisbursementId = (activeToken.info as any)?.disbursement
        ?.id;
      if (existingDisbursementId) {
        this.logger.log(
          `Group ${uuid} was already sent to SDP via disburse-on-create (disbursement ${existingDisbursementId}), queuing status check only`
        );
        await this.queueDisbursementStatusUpdate(existingDisbursementId, uuid);
        continue;
      }

      const dName = `${activeToken.title.toLocaleLowerCase()}_${data.dName}`;
      await this.queueGroupDisbursement(
        uuid,
        dName,
        activeToken.numberOfTokens
      );
    }

    this.logger.log(
      `Successfully queued ${groups.length} SDP disbursement jobs`
    );

    return {
      message: `Disbursement jobs added for ${groups.length} groups`,
      groups: groups.map((group) => ({
        uuid: group.uuid,
        status: 'PENDING',
      })),
    };
  }

  async preDisburse(data: DisburseDto): Promise<any> {
    const groupUuid = data.groups?.[0];
    if (!groupUuid) {
      throw new RpcException('preDisburse requires a single group uuid');
    }

    this.logger.log(
      `Pre-disbursement (disburse-on-create) triggered for group ${groupUuid}`
    );

    await this.queueGroupDisbursement(groupUuid, data.dName, undefined, true);

    return {
      message: `Disbursement job added for group ${groupUuid}`,
      groups: [{ uuid: groupUuid, status: 'PENDING' }],
    };
  }

  private async queueGroupDisbursement(
    groupUuid: string,
    dName: string,
    numberOfTokens?: number,
    skipStatusUpdate = false
  ): Promise<void> {
    this.logger.debug(
      `Queuing SDP disbursement job for group ${groupUuid}${
        numberOfTokens !== undefined ? ` with ${numberOfTokens} tokens` : ''
      }, dName: ${dName}`
    );
    await this.stellarSdpQueue.add(
      JOBS.STELLAR_SDP.DISBURSE,
      {
        dName,
        groups: [groupUuid],
        skipStatusUpdate,
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

  private async queueDisbursementStatusUpdate(
    disbursementId: string,
    groupUuid: string
  ): Promise<void> {
    await this.stellarSdpQueue.add(
      JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
      {
        disbursementId,
        groupUuid,
        startedAt: Date.now(),
      },
      {
        attempts: 3,
        removeOnComplete: true,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
  }

  async getDisbursementStats(payload: {
    startDate?: string;
    endDate: string;
  }): Promise<any> {
    this.logger.log('Fetching disbursement stats for Stellar SDP chain');

    const oneTokenPrice =
      Number(await this.getFromSettings('ONE_TOKEN_PRICE')) || 1;
    const tokenName = String(
      (await this.getFromSettings('ASSETCODE')) ?? 'RAHAT'
    );

    this.logger.debug(
      `Token price: ${oneTokenPrice}, Token name: ${tokenName}`
    );

    const benfTokens = await this.prisma.beneficiaryGroupTokens.findMany({
      where: {
        createdAt: {
          gte: payload?.startDate ? new Date(payload.startDate) : undefined,
          lte: payload?.endDate ? new Date(payload.endDate) : undefined,
        },
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
      const disbursedWithInfo = benfTokens.filter(
        (b) => b.isDisbursed && (b.info as any)?.disbursement
      );

      if (disbursedWithInfo.length > 0) {
        averageDuration =
          disbursedWithInfo.reduce((acc, token) => {
            const info = JSON.parse(JSON.stringify(token.info)) as {
              disbursement: { updated_at: string };
            };
            const timeTaken =
              new Date(info.disbursement.updated_at).getTime() -
              new Date(activityActivationTime).getTime();
            return acc + timeTaken;
          }, 0) / disbursedWithInfo.length;
      }
    }

    return [
      { name: 'Token Disbursed', value: totalDisbursedTokens },
      { name: 'Budget Assigned', value: totalTokens * oneTokenPrice },
      { name: 'Token', value: tokenName },
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

  async getRahatTokenBalance(data: { address: string }): Promise<any> {
    this.logger.debug(`getRahatTokenBalance address=${data.address}`);
    if (!this.validateAddress(data.address)) {
      throw new RpcException(`Invalid Stellar address: ${data.address}`);
    }
    const stellarSettings = await this.getFromSettings(
      'STELLAR_SPONSOR_SETTINGS'
    );
    const client = new StellarClient(
      stellarSettings as unknown as StellarClientConfig
    );
    return getBalance(
      client.server,
      data.address,
      client.config.assetCode,
      client.config.assetIssuer
    );
  }

  // --- Public helpers (used by SDP processor) ---

  async getBeneficiaryTokenBalance(groupUuids: string[]) {
    if (!groupUuids.length) return [];

    const [groups, tokens] = await Promise.all([
      this.fetchGroupedBeneficiaries(groupUuids),
      this.fetchGroupTokenAmounts(groupUuids),
    ]);

    this.logger.log(`Found ${groups.length} groups, ${tokens.length} tokens`);

    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  generateCsv(benData: BeneficiaryCsvData[]): Buffer {
    this.logger.log(`Generating CSV for ${benData.length} beneficiaries`);

    const header =
      'phone,walletAddress,walletAddressMemo,id,amount,paymentID\n';

    const rows = benData
      .map((ben) => {
        const amount = parseFloat(ben.amount);
        if (isNaN(amount) || amount < 1) {
          throw new RpcException(
            `Invalid amount for beneficiary ${ben.id}: must be >= 1`
          );
        }

        const randomNumber = Math.floor(Math.random() * 100000);
        const receiverId = `RECEIVER_${ben.id}`;
        const paymentId = `PAY_${ben.id}_${randomNumber}`;

        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

        return [
          escape(ben.phone),
          escape(ben.walletAddress),
          escape(''),
          escape(receiverId),
          escape(ben.amount),
          escape(paymentId),
        ].join(',');
      })
      .join('\n');

    const csvBuffer = Buffer.from(header + rows, 'utf8');
    this.logger.debug(`CSV generated: ${csvBuffer.length} bytes`);
    return csvBuffer;
  }

  // --- Stub methods ---

  async assignTokens(_data: AssignTokensDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async transferTokens(_data: TransferTokensDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    this.logger.log(
      `Sending OTP to ${data.phoneNumber} for amount ${data.amount}`
    );
    const payoutType = await this.getBeneficiaryPayoutTypeByPhone(
      data.phoneNumber
    );

    if (!payoutType) {
      this.logger.error('Payout not initiated');
      throw new RpcException('Payout not initiated');
    }

    if (payoutType.type !== 'VENDOR') {
      this.logger.error('Payout type is not VENDOR');
      throw new RpcException('Payout type is not VENDOR');
    }

    if (payoutType.mode !== 'ONLINE') {
      this.logger.error('Payout mode is not ONLINE');
      throw new RpcException('Payout mode is not ONLINE');
    }

    return this.sendOtpByPhone(data, payoutType.uuid);
  }

  async sendAssetToVendor(data: SendAssetDto): Promise<any> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { walletAddress: data.receiverAddress },
    });
    if (!vendor) throw new RpcException('Vendor not found');

    const amount = data.amount;
    await this.verifyOTP(data.otp, data.phoneNumber, amount as number);

    const keys = (await this.getSecretByPhone(data.phoneNumber)) as {
      address: string;
      privateKey: string;
    } | null;
    if (!keys?.privateKey)
      throw new RpcException('Beneficiary secret not found');

    // ponytail: redeem-and-forget — queue the transfer and return immediately with a null
    // txHash. Dedicated queue (concurrency: 1) serializes sponsored-account sends in the
    // background since concurrent sends on the same sponsor wallet race the sequence number.
    try {
      await this.stellarSendAssetQueue.add(
        JOBS.STELLAR.SEND_ASSET_TO_VENDOR,
        {
          phoneNumber: data.phoneNumber,
          receiverAddress: data.receiverAddress,
          amount,
          vendorUuid: vendor.uuid,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
      );
    } catch (err) {
      throw err instanceof RpcException ? err : new RpcException(err.message);
    }

    return { txHash: null, status: 'PROCESSING' };
  }

  async processSendAssetToVendor(
    payload: {
      phoneNumber: string;
      receiverAddress: string;
      amount: number;
      vendorUuid: string;
    },
    isLastAttempt = true
  ): Promise<{ txHash: string }> {
    const { phoneNumber, receiverAddress, amount, vendorUuid } = payload;

    // ponytail: re-fetch secret in the job handler instead of passing privateKey through the
    // Redis-persisted job payload.
    const keys = (await this.getSecretByPhone(phoneNumber)) as {
      address: string;
      privateKey: string;
    } | null;
    if (!keys?.privateKey)
      throw new RpcException('Beneficiary secret not found');

    const walletAddress = keys.address;

    const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
      where: {
        beneficiaryWalletAddress: walletAddress,
        status: 'PENDING',
        isCompleted: false,
        txHash: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existingRedeem)
      throw new RpcException('No pending BeneficiaryRedeem record found');

    try {
      const stellarSettings = await this.getFromSettings(
        'STELLAR_SPONSOR_SETTINGS'
      );
      const stellarClient = new StellarClient(
        stellarSettings as unknown as StellarClientConfig
      );

      const tokenBalance = await getBalance(
        stellarClient.server,
        walletAddress,
        stellarClient.config.assetCode,
        stellarClient.config.assetIssuer
      );

      if (parseFloat(tokenBalance) <= 0) {
        throw new RpcException(
          'Beneficiary has no tokens available for transfer'
        );
      }

      const result = await stellarClient.sendFromSponsored(
        keys.privateKey,
        receiverAddress,
        amount.toString()
      );

      await this.prisma.beneficiaryRedeem.update({
        where: { uuid: existingRedeem.uuid },
        data: {
          vendorUid: vendorUuid,
          txHash: result.hash,
          isCompleted: true,
          status: 'COMPLETED',
        },
      });

      this.logger.log(
        `sendAssetToVendor COMPLETED redeem=${existingRedeem.uuid} vendor=${vendorUuid} amount=${amount} txHash=${result.hash}`
      );

      return { txHash: result.hash };
    } catch (err) {
      // ponytail: only mark FAILED on the last retry — earlier attempts must leave the record
      // PENDING so the next job attempt still finds it via the status: 'PENDING' filter above.
      if (isLastAttempt) {
        await this.prisma.beneficiaryRedeem.update({
          where: { uuid: existingRedeem.uuid },
          data: { status: 'FAILED', info: { error: err.message } },
        });
        this.logger.error(
          `sendAssetToVendor FAILED redeem=${existingRedeem.uuid} vendor=${vendorUuid} amount=${amount}: ${err.message}`,
          err.stack
        );
      } else {
        this.logger.warn(
          `sendAssetToVendor attempt failed, will retry redeem=${existingRedeem.uuid} vendor=${vendorUuid}: ${err.message}`
        );
      }
      throw err;
    }
  }

  async transferOfflineRedemptionBatch(
    items: OfflineTransferItem[]
  ): Promise<OfflineTransferResult[]> {
    const walletAddresses = items.map((i) => i.beneficiaryWalletAddress);
    const secrets: { address: string; privateKey: string }[] =
      await lastValueFrom(
        this.client.send(
          { cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET },
          { walletAddresses, chain: 'stellar' }
        )
      );
    const secretByWallet = new Map(
      secrets.map((s) => [s.address, s.privateKey])
    );

    const stellarSettings = await this.getFromSettings(
      'STELLAR_SPONSOR_SETTINGS'
    );
    const stellarClient = new StellarClient(
      stellarSettings as unknown as StellarClientConfig
    );

    const results: OfflineTransferResult[] = [];
    for (const item of items) {
      try {
        const secret = secretByWallet.get(item.beneficiaryWalletAddress);
        if (!secret)
          throw new Error(
            `No secret found for wallet ${item.beneficiaryWalletAddress}`
          );
        const result = await stellarClient.sendFromSponsored(
          secret,
          item.vendorWalletAddress,
          item.amount.toString()
        );
        results.push({
          beneficiaryWalletAddress: item.beneficiaryWalletAddress,
          txHash: result.hash,
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

  async fundAccount(_data: FundAccountDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async checkBalance(_address: string): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async verifyOtp(_data: VerifyOtpDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async getDisbursementStatus(_id: string): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async addTrigger(_data: AddTriggerDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async updateTrigger(_data: UpdateTriggerDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async redeemInkind(_data: RedeemInkindDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async redeemVendorInkindTokens(
    _data: RedeemInkindTokenForCashDto
  ): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  // --- Private helpers ---

  private async getDisbursableGroupsUuids(): Promise<string[]> {
    this.logger.debug('Fetching disbursable group UUIDs');
    const benGroups = await this.prisma.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          { numberOfTokens: { gt: 0 } },
          { isDisbursed: false },
          // { payout: { is: null } },
        ],
      },
      select: { uuid: true, groupId: true },
    });
    this.logger.debug(`Found ${benGroups.length} disbursable groups`);
    return benGroups.map((group) => group.groupId);
  }

  private async getGroupsFromUuid(uuids: string[]) {
    if (!uuids?.length) {
      this.logger.warn('No UUIDs provided for group retrieval');
      return [];
    }
    return this.prisma.beneficiaryGroups.findMany({
      where: { uuid: { in: uuids } },
      include: { tokensReserved: true },
    });
  }

  private async fetchGroupedBeneficiaries(groupUuids: string[]) {
    this.logger.debug(
      `Fetching grouped beneficiaries for ${groupUuids.length} groups`
    );
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: groupUuids.map((uuid) => ({ uuid })) }
      )
    );
    return response.data ?? [];
  }

  private async fetchGroupTokenAmounts(groupUuids: string[]) {
    return this.prisma.beneficiaryGroupTokens.findMany({
      where: { groupId: { in: groupUuids }, isDisbursed: false },
      select: { numberOfTokens: true, groupId: true },
    });
  }

  private computeBeneficiaryTokenDistribution(
    groups: any[],
    tokens: { numberOfTokens: number; groupId: string }[]
  ): BeneficiaryCsvData[] {
    this.logger.debug(
      `Computing token distribution for ${groups.length} groups`
    );
    const csvData: Record<string, BeneficiaryCsvData> = {};

    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;
      const totalBeneficiaries = group._count?.groupedBeneficiaries;
      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      group.groupedBeneficiaries.forEach(({ Beneficiary }) => {
        const phone = Beneficiary.pii?.phone || Beneficiary.phone || '';
        const walletAddress = Beneficiary.walletAddress;
        const name = Beneficiary.pii?.name || Beneficiary.name || walletAddress;
        const amount = tokenPerBeneficiary;

        if (csvData[walletAddress]) {
          csvData[walletAddress].amount = (
            parseFloat(csvData[walletAddress].amount) + amount
          ).toString();
        } else {
          csvData[walletAddress] = {
            phone,
            walletAddress,
            name,
            id: Beneficiary.uuid,
            amount: amount.toString(),
          };
        }
      });
    });

    const result = Object.values(csvData);
    this.logger.debug(
      `Token distribution computed for ${result.length} beneficiaries`
    );
    return result;
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
    } catch {
      throw new RpcException(`Beneficiary with phone ${phoneNumber} not found`);
    }
  }

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({ where: { phoneNumber } });
    if (!record) throw new RpcException('OTP record not found');
    if (record.isVerified) throw new RpcException('OTP already verified');
    if (record.expiresAt < new Date())
      throw new RpcException('OTP has expired');

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);
    if (!isValid) throw new RpcException('Invalid OTP or amount mismatch');

    await this.prisma.otp.update({
      where: { phoneNumber },
      data: { isVerified: true },
    });
    return true;
  }

  private async storeOTP(otp: string, phoneNumber: string, amount: number) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
    const otpHash = await bcrypt.hash(`${otp}:${amount}`, 10);

    const otpRes = await this.prisma.otp.upsert({
      where: { phoneNumber },
      update: {
        otpHash,
        amount,
        expiresAt,
        isVerified: false,
        updatedAt: new Date(),
      },
      create: { phoneNumber, otpHash, amount, expiresAt },
    });

    const { otpHash: _, ...safeRes } = otpRes;
    return safeRes;
  }

  private async getBeneficiaryPayoutTypeByPhone(phone: string): Promise<any> {
    const beneficiary = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
        { phone, projectUUID: process.env.PROJECT_ID }
      )
    );

    if (!beneficiary) throw new RpcException('Beneficiary not found');
    if (!beneficiary.groupedBeneficiaries)
      throw new RpcException('Beneficiary has no grouped beneficiaries');

    const payoutEligibleGroups = beneficiary.groupedBeneficiaries.filter(
      (g: any) => g.groupPurpose !== 'COMMUNICATION'
    );

    if (!payoutEligibleGroups.length)
      throw new RpcException('No payout-eligible group found for beneficiary');
    if (payoutEligibleGroups.length > 1)
      throw new RpcException(
        'Multiple payout-eligible groups found for beneficiary'
      );

    const beneficiaryGroups = await this.prisma.beneficiaryGroups.findUnique({
      where: { uuid: payoutEligibleGroups[0].beneficiaryGroupId },
      include: { tokensReserved: { include: { payout: true } } },
    });

    if (!beneficiaryGroups)
      throw new RpcException('Beneficiary group not found');

    this.logger.log(
      `Found beneficiary group ${beneficiaryGroups.uuid} for phone ${phone}`
    );
    this.logger.log(
      `Beneficiary group details: ${JSON.stringify(beneficiaryGroups)}`
    );
    if (!beneficiaryGroups.tokensReserved)
      throw new RpcException('Tokens not reserved for the group');

    const activeToken = beneficiaryGroups.tokensReserved.find(
      (t) => t.isDisbursed === true && t.payout?.status !== 'COMPLETED'
    );

    if (!activeToken) {
      this.logger.error('No active payout found for the group');
      throw new RpcException('No active payout found for the group');
    }

    return activeToken.payout;
  }

  private async sendOtpByPhone(data: SendOtpDto, payoutId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: data.vendorUuid },
    });
    if (!vendor) throw new RpcException('Vendor not found');

    const keys = (await this.getSecretByPhone(data.phoneNumber)) as any;
    if (!keys) throw new RpcException('Beneficiary address not found');

    const stellarSettings = await this.getFromSettings(
      'STELLAR_SPONSOR_SETTINGS'
    );
    const stellarClient = new StellarClient(
      stellarSettings as unknown as StellarClientConfig
    );

    const tokenBalance = await getBalance(
      stellarClient.server,
      keys.address,
      stellarClient.config.assetCode,
      stellarClient.config.assetIssuer
    );

    const beneficiaryTokenBalance = parseFloat(tokenBalance);
    if (!beneficiaryTokenBalance)
      throw new RpcException('Beneficiary token balance not found');

    const amount = data.amount || beneficiaryTokenBalance;
    if (Number(amount) > beneficiaryTokenBalance)
      throw new RpcException(
        `Requested amount ${amount} exceeds available balance ${beneficiaryTokenBalance}`
      );
    if (Number(amount) <= 0)
      throw new RpcException('Amount must be greater than 0');

    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.otp.send_otp' },
        { phoneNumber: data.phoneNumber, amount }
      )
    );

    const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
      where: { beneficiaryWalletAddress: keys.address },
      orderBy: { createdAt: 'desc' },
    });

    if (existingRedeem) {
      await this.prisma.beneficiaryRedeem.update({
        where: { uuid: existingRedeem.uuid },
        data: {
          vendorUid: data.vendorUuid,
          amount: amount as number,
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          payoutId,
        },
      });
    } else {
      await this.prisma.beneficiaryRedeem.create({
        data: {
          beneficiaryWalletAddress: keys.address,
          amount: amount as number,
          transactionType: 'VENDOR_REIMBURSEMENT',
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          vendorUid: data.vendorUuid,
          payoutId,
        },
      });
    }

    return this.storeOTP(res.otp, data.phoneNumber, amount as number);
  }

  private async getFromSettings(key: string) {
    try {
      const settings = await this.settingsService.getPublic(key);
      return settings?.value;
    } catch {
      return null;
    }
  }

  private async getActivityActivationTime() {
    const projectInfo = await this.settingsService.getPublic('PROJECTINFO');

    if (!projectInfo) {
      this.logger.warn('Project info not found in SETTINGS');
      return null;
    }

    const activeYear = projectInfo?.value?.['active_year'];
    const riverBasin = projectInfo?.value?.['river_basin'];

    if (!activeYear || !riverBasin) {
      this.logger.warn('Active year or river basin not found in SETTINGS');
      return null;
    }

    try {
      const data = await lastValueFrom(
        this.client.send(
          { cmd: 'ms.jobs.phases.getAll' },
          { activeYear, riverBasin }
        )
      );

      const activationPhase = data.data.find((p) => p.name === 'ACTIVATION');
      if (!activationPhase?.isActive) {
        this.logger.warn(
          `Activation phase not found or not active for ${riverBasin}/${activeYear}`
        );
        return null;
      }

      return activationPhase.activatedAt;
    } catch (error) {
      this.logger.error('Error fetching activation time', error);
      return null;
    }
  }
}
