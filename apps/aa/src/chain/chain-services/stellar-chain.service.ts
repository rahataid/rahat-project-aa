import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { SettingsService } from '@rumsan/settings';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../../constants';
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
import { Keypair, MAX_TRANSFERS_PER_BATCH } from '@rahataid/stellar';
import { SdpClient } from '@rahataid/stellar-sdp';
import { chunkArray } from '../../utils/utility';
import bcrypt from 'bcryptjs';
import { InkindsService } from '../../inkinds/inkinds.service';
import { ModuleRef } from '@nestjs/core';
import { InkindTxStatus } from '../../inkinds/dto/inkind.dto';

// Wallets per RETURN_TOKENS job: 2 sponsored batches of MAX_TRANSFERS_PER_BATCH (12).
// Keeps each job short and the Redis payload small no matter how large the group is.
export const RETURN_TOKENS_CHUNK_SIZE = 24;

export interface ReturnTokensJobData {
  payoutUuid: string;
  wallets: string[];
  // old per-beneficiary amount; caps each return so new-reservation tokens stay put
  amountPerWallet?: number;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface BeneficiaryCsvData {
  phone: string;
  walletAddress: string;
  name: string;
  id: string;
  amount: string;
}

@Injectable()
export class StellarChainService implements IChainService, OnModuleInit {
  private readonly logger = new Logger(StellarChainService.name);

  // Lazy-loaded service to avoid circular dependency issues
  private _inkindService: InkindsService | null = null;

  // Cached at startup so the ~1000s of concurrent redeemInkind calls reuse one
  // client/Horizon connection instead of rebuilding it (and refetching
  // settings) on every call.
  private inkindClient: StellarClient | null = null;

  constructor(
    @InjectQueue(BQUEUE.STELLAR_SDP) private stellarSdpQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR_DISBURSE) private stellarDisburseQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR_SEND_ASSET)
    private stellarSendAssetQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR_INKIND_REDEEM)
    private stellarInkindQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async onModuleInit() {
    await this.initializeInkindClient().catch((err) =>
      this.logger.warn(
        `STELLAR_INKIND_SETTINGS not ready at startup, will retry lazily on first redeemInkind: ${err.message}`
      )
    );
  }

  private async initializeInkindClient(): Promise<StellarClient> {
    const settings = await this.getFromSettings('STELLAR_INKIND_SETTINGS');
    if (!settings) {
      throw new Error('STELLAR_INKIND_SETTINGS not configured');
    }
    const cfg = settings as {
      network: 'testnet' | 'mainnet';
      horizonUrl?: string;
      assetCode: string;
      assetIssuer: string;
      distribution_wallet_secret_key: string;
    };
    if (
      !cfg.network ||
      !cfg.assetCode ||
      !cfg.assetIssuer ||
      !cfg.distribution_wallet_secret_key
    ) {
      throw new Error(
        'STELLAR_INKIND_SETTINGS missing required fields (network, assetCode, assetIssuer, distribution_wallet_secret_key)'
      );
    }

    this.inkindClient = new StellarClient({
      network: cfg.network,
      horizonUrl: cfg.horizonUrl,
      sponsorSecret: cfg.distribution_wallet_secret_key,
      assetCode: cfg.assetCode,
      assetIssuer: cfg.assetIssuer,
    } as unknown as StellarClientConfig);

    this.logger.log(
      `Stellar inkind distribution client initialized [network=${cfg.network}]`
    );
    return this.inkindClient;
  }

  private async getInkindClient(): Promise<StellarClient> {
    return this.inkindClient ?? this.initializeInkindClient();
  }

  getChainType(): ChainType {
    return 'stellar';
  }

  validateAddress(address: string): boolean {
    return address.length === 56 && address.startsWith('G');
  }

  private get inkindService(): InkindsService {
    return (this._inkindService ??= this.moduleRef.get(InkindsService, {
      strict: false,
    }));
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
    const disbursementSettings = await this.getDisbursementSettings();

    this.logger.log(
      `Adding disbursement jobs for ${groups.length} groups [mode=${disbursementSettings.STELLAR_DISBURSMENT_MODE}, checkTrustline=${disbursementSettings.CHECK_TRUSTLINE}]`
    );

    for (const { uuid, tokensReserved, beneficiaries } of groups) {
      const activeToken = tokensReserved.find((t) => t.isDisbursed === false);
      if (!activeToken) {
        this.logger.warn(
          `Group ${uuid} has no active token reservation, skipping`
        );
        continue;
      }

      this.logger.log(
        `Processing group ${uuid} with token ${activeToken.title} (${activeToken.numberOfTokens} tokens)`
      );

      // // CHECK_TRUSTLINE false → trust the extras.stellarSponsored flag instead of an
      // // on-chain trustline check (done by the direct disburse processor when true).
      // if (!disbursementSettings.CHECK_TRUSTLINE) {
      //   const allSponsored = beneficiaries.every((b) => {
      //     const sponsoredAttr = (b.beneficiary?.extras as any)
      //       ?.stellarSponsored;
      //     return sponsoredAttr === true;
      //   });
      //
      //   if (!allSponsored) {
      //     const errorMsg = `Trust check failed: group ${uuid} contains beneficiaries without confirmed stellarSponsored flag`;
      //     this.logger.error(errorMsg);
      //     await this.prisma.beneficiaryGroupTokens.update({
      //       where: { uuid: activeToken.uuid },
      //       data: {
      //         status: 'FAILED',
      //         info: {
      //           ...(activeToken.info as any),
      //           error: errorMsg,
      //           failedAt: new Date().toISOString(),
      //         },
      //       },
      //     });
      //     continue;
      //   }
      // }

      if (disbursementSettings.STELLAR_DISBURSMENT_MODE === 'DIRECT') {
        const dName = `${activeToken.title.toLocaleLowerCase()}_${data.dName}`;
        await this.queueDirectGroupDisbursement(uuid, dName);
        continue;
      }

      // SDP path
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
      `Successfully queued ${groups.length} disbursement jobs [mode=${disbursementSettings.STELLAR_DISBURSMENT_MODE}]`
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
      throw new RpcException({
        message: 'preDisburse requires a single group uuid',
        code: 'PRE_DISBURSE_REQUIRES_SINGLE_GROUP_UUID',
      });
    }

    const disbursementSettings = await this.getDisbursementSettings();

    this.logger.log(
      `Pre-disbursement (disburse-on-create) triggered for group ${groupUuid} [mode=${disbursementSettings.STELLAR_DISBURSMENT_MODE}]`
    );

    if (disbursementSettings.STELLAR_DISBURSMENT_MODE === 'DIRECT') {
      await this.queueDirectGroupDisbursement(groupUuid, data.dName);
    } else {
      await this.queueGroupDisbursement(groupUuid, data.dName, undefined, true);
    }

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

  private async queueDirectGroupDisbursement(
    groupUuid: string,
    dName: string
  ): Promise<void> {
    this.logger.debug(
      `Queuing direct disbursement job for group ${groupUuid}, dName: ${dName}`
    );
    await this.stellarDisburseQueue.add(
      JOBS.STELLAR_DIRECT.DISBURSE,
      { dName, groups: [groupUuid] },
      {
        attempts: 3,
        delay: 2000,
        removeOnComplete: true,
        backoff: { type: 'exponential', delay: 1000 },
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
    endDate?: string;
  }): Promise<any[]> {
    this.logger.log('Fetching disbursement stats for Stellar SDP chain');

    const oneTokenPrice =
      Number(await this.getFromSettings('ONE_TOKEN_PRICE')) || 1;
    const tokenName = String(
      (await this.getFromSettings('ASSETCODE')) ?? 'RAHAT'
    );

    this.logger.debug(
      `Token price: ${oneTokenPrice}, Token name: ${tokenName}`
    );

    // Apply date filter to beneficiaryGroupTokens
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
  async getRahatTokenBalance(data: {
    address: string;
    role?: string;
  }): Promise<any> {
    try {
      this.logger.log(
        `Getting RahatToken balance for address: ${data.address}`,
        StellarChainService.name
      );

      if (!this.validateAddress(data.address)) {
        throw new RpcException({
          message: `Invalid Stellar address: ${data.address}`,
          code: 'INVALID_STELLAR_ADDRESS',
          params: { address: data.address },
        });
      }

      const stellarSettings = await this.getFromSettings(
        'STELLAR_SPONSOR_SETTINGS'
      );
      const client = new StellarClient(
        stellarSettings as unknown as StellarClientConfig
      );
      const balance = await getBalance(
        client.server,
        data.address,
        client.config.assetCode,
        client.config.assetIssuer
      );

      this.logger.log(
        `Successfully retrieved RahatToken balance for ${data.address}: ${balance}`,
        StellarChainService.name
      );

      if (data.role && data.role.toLowerCase() === 'vendor') {
        return { balance, address: data.address };
      }

      return { balance, address: data.address, decimals: '0' };
    } catch (error: any) {
      this.logger.error(
        `Error getting RahatToken balance for ${data.address}: ${error.message}`,
        error.stack,
        StellarChainService.name
      );
      throw error;
    }
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
          throw new RpcException({
            message: `Invalid amount for beneficiary ${ben.id}: must be >= 1`,
            code: 'INVALID_AMOUNT_FOR_BENEFICIARY',
            params: { id: ben.id },
          });
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
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async transferTokens(_data: TransferTokensDto): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
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
      throw new RpcException({
        message: 'Payout not initiated',
        code: 'PAYOUT_ERR_SEND_OTP_NOT_INITIATED',
      });
    }

    if (payoutType.type !== 'VENDOR') {
      this.logger.error('Payout type is not VENDOR');
      throw new RpcException({
        message: 'Payout type is not VENDOR',
        code: 'PAYOUT_ERR_SEND_OTP_TYPE_NOT_VENDOR',
      });
    }

    if (payoutType.mode !== 'ONLINE') {
      this.logger.error('Payout mode is not ONLINE');
      throw new RpcException({
        message: 'Payout mode is not ONLINE',
        code: 'PAYOUT_ERR_SEND_OTP_MODE_NOT_ONLINE',
      });
    }

    return this.sendOtpByPhone(data, payoutType.uuid);
  }

  async sendAssetToVendor(data: SendAssetDto): Promise<any> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { walletAddress: data.receiverAddress },
    });
    if (!vendor)
      throw new RpcException({
        message: 'Vendor not found',
        code: 'PAYOUT_ERR_VENDOR_NOT_FOUND',
      });

    const amount = data.amount;

    if (!data.skipOtpVerification) {
      await this.verifyOTP(data.otp, data.phoneNumber, amount as number);
    }

    const keys = (await this.getSecretByPhone(data.phoneNumber)) as {
      address: string;
      privateKey: string;
    } | null;
    if (!keys?.privateKey)
      throw new RpcException({
        message: 'Beneficiary secret not found',
        code: 'BENEFICIARY_SECRET_NOT_FOUND',
      });

    if (data.mediaUrl || data.skipOtpVerification) {
      const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
        where: {
          beneficiaryWalletAddress: keys.address,
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingRedeem) {
        const info = (existingRedeem.info as Record<string, any>) ?? {};
        const infoUpdate: Record<string, any> = { ...info };

        if (data.mediaUrl) {
          this.logger.log(
            `Updating mediaUrl for redeem record ${existingRedeem.uuid} to ${data.mediaUrl}`
          );
          infoUpdate.mediaUrl = data.mediaUrl;
          infoUpdate.fileName = data.fileName;
        }

        if (data.skipOtpVerification) {
          infoUpdate.otpSkip = true;
          infoUpdate.otpSkipReason = data.otpSkipReason;
        }

        await this.prisma.beneficiaryRedeem.update({
          where: { uuid: existingRedeem.uuid },
          data: { info: infoUpdate },
        });
      }
    }

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
      throw new RpcException({
        message: 'Beneficiary secret not found',
        code: 'BENEFICIARY_SECRET_NOT_FOUND',
      });

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
      throw new RpcException({
        message: 'No pending BeneficiaryRedeem record found',
        code: 'NO_PENDING_BENEFICIARY_REDEEM_FOUND',
      });

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
        throw new RpcException({
          message: 'Beneficiary has no tokens available for transfer',
          code: 'BENEFICIARY_NO_TOKENS_AVAILABLE',
        });
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

      if (existingRedeem.payoutId) {
        await this.eventEmitter.emitAsync(EVENTS.BENEFICIARY_REDEEM_COMPLETED, {
          payoutId: existingRedeem.payoutId,
        });
      }

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

  /**
   * Queues the background token return as one small job per RETURN_TOKENS_CHUNK_SIZE wallets
   * (never one job for the whole group). Job ids are deterministic so re-queueing the same
   * payout can't duplicate chunks that are still waiting.
   */
  async queueReturnTokens(payload: ReturnTokensJobData): Promise<void> {
    const { payoutUuid, wallets, amountPerWallet } = payload;
    const chunks = chunkArray(wallets, RETURN_TOKENS_CHUNK_SIZE);
    this.logger.log(
      `[ReturnTokens] payout=${payoutUuid} QUEUE ${wallets.length} wallet(s) -> ${chunks.length} job(s) of <=${RETURN_TOKENS_CHUNK_SIZE}, cap=${amountPerWallet}/wallet`
    );
    if (!chunks.length) {
      await this.setTokenReturnState(payoutUuid, {
        status: 'COMPLETED',
        totalWallets: 0,
        totalChunks: 0,
        completedChunks: [],
        failedChunks: [],
      });
      return;
    }

    await this.setTokenReturnState(payoutUuid, {
      status: 'QUEUED',
      totalWallets: wallets.length,
      totalChunks: chunks.length,
      completedChunks: [],
      failedChunks: [],
    });
    const queuedAt = Date.now();
    await this.stellarSendAssetQueue.addBulk(
      chunks.map((chunk, chunkIndex) => ({
        name: JOBS.STELLAR.RETURN_TOKENS,
        data: {
          payoutUuid,
          wallets: chunk,
          amountPerWallet,
          chunkIndex,
          totalChunks: chunks.length,
        } as ReturnTokensJobData,
        opts: {
          jobId: `return-tokens-${payoutUuid}-${chunkIndex}`,
          attempts: 3,
          removeOnComplete: true,
          removeOnFail: false,
          backoff: { type: 'exponential', delay: 5000 },
        },
      }))
    );
    this.logger.log(
      `[ReturnTokens] payout=${payoutUuid} QUEUED ${chunks.length} job(s) in ${Date.now() - queuedAt}ms (queue STELLAR_SEND_ASSET, concurrency 1, 3 attempts each)`
    );
  }

  /**
   * Job handler for one chunk. Per-wallet progress lives on the payout's redeem rows
   * (info.tokenReturn.txHash), so a retried/stalled chunk never resends a wallet that was
   * already returned (which, with a new reservation disbursed meanwhile, would otherwise
   * claw back the new tokens). Chunk-level progress is aggregated on payout.extras.tokenReturn.
   */
  async processReturnTokens(
    payload: ReturnTokensJobData,
    isLastAttempt = true
  ): Promise<void> {
    const { payoutUuid, wallets, amountPerWallet, chunkIndex = 0 } = payload;
    const totalChunks = payload.totalChunks ?? 1;

    const payout = await this.prisma.payouts.findUnique({
      where: { uuid: payoutUuid },
      select: { uuid: true },
    });
    if (!payout) {
      this.logger.warn(`returnTokens: payout ${payoutUuid} not found, skipping`);
      return;
    }

    const rows = await this.prisma.beneficiaryRedeem.findMany({
      where: { payoutId: payoutUuid, beneficiaryWalletAddress: { in: wallets } },
      select: { uuid: true, beneficiaryWalletAddress: true, info: true },
    });
    const done = new Set(
      rows
        .filter((r) => (r.info as any)?.tokenReturn?.txHash)
        .map((r) => r.beneficiaryWalletAddress)
    );
    const pending = wallets.filter((w) => !done.has(w));
    const chunkStartedAt = Date.now();
    this.logger.log(
      `[ReturnTokens] payout=${payoutUuid} chunk=${chunkIndex + 1}/${totalChunks} START ${pending.length} to return, ${done.size} already returned, lastAttempt=${isLastAttempt}`
    );

    let error: string | undefined;
    try {
      const results = await this.returnTokensToDistributionWallet(
        pending,
        amountPerWallet
      );
      const at = new Date().toISOString();
      await Promise.all(
        results
          .filter((r) => !r.error)
          .flatMap((r) =>
            rows
              .filter((row) => row.beneficiaryWalletAddress === r.walletAddress)
              .map((row) =>
                this.prisma.beneficiaryRedeem.update({
                  where: { uuid: row.uuid },
                  data: {
                    info: {
                      ...((row.info as object) ?? {}),
                      tokenReturn: {
                        txHash: r.txHash ?? 'NO_BALANCE',
                        amount: r.amount,
                        at,
                      },
                    },
                  },
                })
              )
          )
      );
      const failed = results.filter((r) => r.error);
      if (failed.length) {
        error = `${failed.length} wallet(s) failed: ${failed[0].error}`;
      }
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    await this.updateTokenReturnProgress(
      payoutUuid,
      chunkIndex,
      totalChunks,
      error ? (isLastAttempt ? 'failed' : 'retry') : 'completed',
      error
    );

    if (error) {
      this.logger.error(
        `[ReturnTokens] payout=${payoutUuid} chunk=${chunkIndex + 1}/${totalChunks} ${
          isLastAttempt ? 'FAILED (no more retries)' : 'attempt failed, will retry'
        } after ${Date.now() - chunkStartedAt}ms: ${error}`
      );
      throw new Error(error);
    }
    this.logger.log(
      `[ReturnTokens] payout=${payoutUuid} chunk=${chunkIndex + 1}/${totalChunks} COMPLETED in ${Date.now() - chunkStartedAt}ms`
    );
  }

  /** Aggregates chunk outcomes into payout.extras.tokenReturn (chunk indexes only, so it stays small). */
  private async updateTokenReturnProgress(
    payoutUuid: string,
    chunkIndex: number,
    totalChunks: number,
    outcome: 'completed' | 'failed' | 'retry',
    error?: string
  ): Promise<void> {
    const fresh = await this.prisma.payouts.findUnique({
      where: { uuid: payoutUuid },
      select: { extras: true },
    });
    const prev = ((fresh?.extras as any)?.tokenReturn ?? {}) as Record<string, any>;
    const completed = new Set<number>(prev.completedChunks ?? []);
    const failed = new Set<number>(prev.failedChunks ?? []);
    if (outcome === 'completed') {
      completed.add(chunkIndex);
      failed.delete(chunkIndex);
    } else if (outcome === 'failed') {
      failed.add(chunkIndex);
    }
    const finished = completed.size + failed.size >= totalChunks;
    this.logger.log(
      `[ReturnTokens] payout=${payoutUuid} PROGRESS ${completed.size}/${totalChunks} chunks done, ${failed.size} failed${
        finished ? ` -> ${failed.size ? 'FAILED' : 'COMPLETED'}` : ''
      }`
    );
    await this.setTokenReturnState(payoutUuid, {
      ...prev,
      status: finished ? (failed.size ? 'FAILED' : 'COMPLETED') : 'PROCESSING',
      totalChunks,
      completedChunks: [...completed].sort((x, y) => x - y),
      failedChunks: [...failed].sort((x, y) => x - y),
      error: outcome === 'completed' ? prev.error : error ?? prev.error,
    });
  }

  /** Merges tokenReturn into a freshly-read extras so concurrent extras writes aren't clobbered. */
  async setTokenReturnState(
    payoutUuid: string,
    state: Record<string, unknown>
  ): Promise<void> {
    const fresh = await this.prisma.payouts.findUnique({
      where: { uuid: payoutUuid },
      select: { extras: true },
    });
    await this.prisma.payouts.update({
      where: { uuid: payoutUuid },
      data: {
        extras: {
          ...((fresh?.extras as object) ?? {}),
          tokenReturn: { ...state, updatedAt: new Date().toISOString() },
        } as any,
      },
    });
  }

  /**
   * Sends each wallet's token balance back to the distribution wallet, capped at
   * `maxAmountPerWallet` when given (so tokens from a newer reservation are never taken).
   * DIRECT mode: the local distribution wallet is both destination and fee payer.
   * SDP mode: destination is the SDP distribution account (from the SDP API); we hold
   * no secret for it, so the sponsor wallet pays the fee. Beneficiaries never pay.
   * Zero-balance wallets are reported with amount '0' and no txHash.
   */
  async returnTokensToDistributionWallet(
    walletAddresses: string[],
    maxAmountPerWallet?: number
  ): Promise<
    { walletAddress: string; amount: string; txHash?: string; error?: string }[]
  > {
    if (!walletAddresses.length) return [];

    const disbursementSettings = await this.getDisbursementSettings();
    const sponsorSettings = (await this.getFromSettings(
      'STELLAR_SPONSOR_SETTINGS'
    )) as unknown as StellarClientConfig;
    if (!sponsorSettings) {
      throw new RpcException({
        message: 'STELLAR_SPONSOR_SETTINGS not configured',
        code: 'STELLAR_SPONSOR_SETTINGS_NOT_FOUND',
      });
    }

    let destination: string;
    let clientConfig: StellarClientConfig = sponsorSettings;
    if (disbursementSettings.STELLAR_DISBURSMENT_MODE === 'DIRECT') {
      const secret = disbursementSettings.STELLAR_DISTRUBUTION_WALLET_SECRET;
      if (!secret) {
        throw new RpcException({
          message:
            'STELLAR_DISTRUBUTION_WALLET_SECRET not set in STELLAR_DISBURSEMENT_SETTINGS',
          code: 'STELLAR_DISTRIBUTION_WALLET_SECRET_NOT_SET',
        });
      }
      destination = Keypair.fromSecret(secret).publicKey();
      // distribution wallet as tx source => it pays the fee
      clientConfig = { ...sponsorSettings, sponsorSecret: secret };
    } else {
      destination = await this.getSdpDistributionAccount();
    }

    const client = new StellarClient(clientConfig);
    this.logger.log(
      `[ReturnTokens] TRANSFER mode=${disbursementSettings.STELLAR_DISBURSMENT_MODE} to=${destination} feePayer=${client.sponsorPublicKey} wallets=${walletAddresses.length} cap=${maxAmountPerWallet ?? 'none'}`
    );

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

    const results: {
      walletAddress: string;
      amount: string;
      txHash?: string;
      error?: string;
    }[] = [];
    const toSend: { walletAddress: string; secret: string; amount: string }[] =
      [];

    await Promise.all(
      walletAddresses.map(async (walletAddress) => {
      try {
        const secret = secretByWallet.get(walletAddress);
        if (!secret) throw new Error(`No secret found for wallet ${walletAddress}`);
        // the payment is sourced from the secret's account, not from walletAddress: make sure
        // they match and that we never send from the destination itself
        const sourcePublicKey = Keypair.fromSecret(secret).publicKey();
        if (sourcePublicKey !== walletAddress) {
          throw new Error(
            `Secret for wallet ${walletAddress} belongs to ${sourcePublicKey}; refusing to send`
          );
        }
        if (sourcePublicKey === destination) {
          throw new Error(
            `Wallet ${walletAddress} is the destination account; refusing to send`
          );
        }
        const balance = parseFloat(await client.getBalance(walletAddress));
        const sendable =
          maxAmountPerWallet === undefined
            ? balance
            : Math.min(balance, maxAmountPerWallet);
        this.logger.debug(
          `[ReturnTokens] wallet=${walletAddress} balance=${balance} sending=${Math.max(sendable, 0)}`
        );
        if (sendable > 0)
          toSend.push({ walletAddress, secret, amount: sendable.toFixed(7) });
        else results.push({ walletAddress, amount: '0' });
      } catch (err: any) {
        results.push({ walletAddress, amount: '0', error: err?.message });
      }
      })
    );

    for (const chunk of chunkArray(toSend, MAX_TRANSFERS_PER_BATCH)) {
      try {
        const res = await client.sendFromSponsoredBatch(
          chunk.map((c) => ({
            secret: c.secret,
            destination,
            amount: c.amount,
          }))
        );
        this.logger.log(
          `[ReturnTokens] batch OK ${chunk.length} wallet(s) -> ${destination}, txHash=${res.hash}, from=${chunk
            .map((c) => c.walletAddress)
            .join(',')}`
        );
        chunk.forEach((c) =>
          results.push({
            walletAddress: c.walletAddress,
            amount: c.amount,
            txHash: res.hash,
          })
        );
      } catch (err: any) {
        this.logger.error(
          `[ReturnTokens] batch FAILED ${chunk.length} wallet(s) (${chunk
            .map((c) => c.walletAddress)
            .join(',')}): ${err?.message}`,
          err?.stack
        );
        chunk.forEach((c) =>
          results.push({
            walletAddress: c.walletAddress,
            amount: c.amount,
            error: err?.message,
          })
        );
      }
    }

    this.logger.log(
      `[ReturnTokens] TRANSFER SUMMARY to ${destination}: ${
        results.filter((r) => r.txHash).length
      } sent, ${results.filter((r) => r.error).length} failed, ${
        results.filter((r) => !r.txHash && !r.error).length
      } empty`
    );
    return results;
  }

  private async getSdpDistributionAccount(): Promise<string> {
    const sdpSettings = (await this.getFromSettings('SDP_SETTINGS')) as Record<
      string,
      string
    > | null;
    if (!sdpSettings) {
      throw new RpcException({
        message: 'SDP_SETTINGS not found in settings table',
        code: 'SDP_SETTINGS_NOT_FOUND',
      });
    }
    const sdp = new SdpClient({
      sdpUrl: sdpSettings.sdpUrl,
      tenantName: sdpSettings.tenantName,
      apiKey: sdpSettings.apiKey,
    });

    const balance = await sdp.balances.get();
    let account = balance?.account;
    this.logger.log(
      `[ReturnTokens] SDP distribution account from /balances: ${account ?? 'not present, falling back to /organization'}`
    );
    if (!account) {
      const org = await sdp.organization.get();
      account = org?.['distribution_account_public_key'] as string | undefined;
    }
    if (!account) {
      throw new RpcException({
        message: 'Could not resolve SDP distribution account from SDP API',
        code: 'SDP_DISTRIBUTION_ACCOUNT_NOT_FOUND',
      });
    }
    return account;
  }

  async fundAccount(_data: FundAccountDto): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async checkBalance(_address: string): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async verifyOtp(_data: VerifyOtpDto): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async getDisbursementStatus(_id: string): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async addTrigger(_data: AddTriggerDto): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async updateTrigger(_data: UpdateTriggerDto): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
  }

  async redeemInkind(data: RedeemInkindDto): Promise<any> {
    this.logger.log(
      `Queuing inkind redemption: vendor=${data.vendorAddress}, beneficiary=${data.beneficiaryAddress}, amount=${data.amount}`
    );
    return this.stellarInkindQueue.add(JOBS.STELLAR.REDEEM_INKIND, data, {
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  /**
   * Sends the inkind asset directly from the distribution wallet to the
   * vendor (no beneficiary-owned account involved) and records the tx hash.
   */
  async processRedeemInkind(
    data: RedeemInkindDto,
    isLastAttempt = true
  ): Promise<void> {
    const {
      beneficiaryAddress,
      inkindId: inkinds,
      vendorAddress,
      amount,
    } = data;

    if (!amount || amount <= 0) {
      throw new RpcException(`Invalid inkind redemption amount: ${amount}`);
    }

    try {
      const client = await this.getInkindClient();
      const settings = await this.getFromSettings('STELLAR_INKIND_SETTINGS');
      const distributionSecret = (
        settings as { distribution_wallet_secret_key?: string }
      )?.distribution_wallet_secret_key;
      if (!distributionSecret) {
        throw new Error(
          'STELLAR_INKIND_SETTINGS missing distribution_wallet_secret_key'
        );
      }

      const result = await client.sendPayment(
        distributionSecret,
        vendorAddress,
        client.asset,
        amount.toString()
      );

      await this.inkindService.updateRedeemInkindTxHash(
        inkinds,
        result.hash,
        beneficiaryAddress
      );

      this.logger.log(
        `Inkind redemption COMPLETED beneficiary=${beneficiaryAddress} vendor=${vendorAddress} amount=${amount} txHash=${result.hash}`
      );
    } catch (err: any) {
      if (isLastAttempt) {
        await this.prisma.beneficiaryInkindRedemption.updateMany({
          where: {
            beneficiaryWallet: beneficiaryAddress,
            groupInkind: { inkindId: { in: inkinds } },
          },
          data: { status: InkindTxStatus.FAILED },
        });
        this.logger.error(
          `Inkind redemption FAILED beneficiary=${beneficiaryAddress} vendor=${vendorAddress} amount=${amount}: ${err.message}`,
          err.stack
        );
      } else {
        this.logger.warn(
          `Inkind redemption attempt failed, will retry beneficiary=${beneficiaryAddress} vendor=${vendorAddress}: ${err.message}`
        );
      }
      throw err instanceof RpcException
        ? err
        : new RpcException({
            message: `Error redeeming in-kind: ${err.message}`,
            code: 'ERROR_REDEEMING_INKIND',
            params: { message: err.message },
          });
    }
  }

  async redeemVendorInkindTokens(
    _data: RedeemInkindTokenForCashDto
  ): Promise<any> {
    throw new RpcException({
      message: 'Not supported on Stellar SDP chain',
      code: 'NOT_SUPPORTED_ON_STELLAR_SDP',
    });
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
      include: {
        tokensReserved: true,
        beneficiaries: {
          include: {
            beneficiary: {
              select: {
                extras: true,
              },
            },
          },
        },
      },
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
      throw new RpcException({
        message: `Beneficiary with phone ${phoneNumber} not found`,
        code: 'PAYOUT_ERR_BENEFICIARY_PHONE_NOT_FOUND',
        params: { phoneNumber },
      });
    }
  }

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({ where: { phoneNumber } });
    if (!record)
      throw new RpcException({
        message: 'OTP record not found',
        code: 'OTP_RECORD_NOT_FOUND',
      });
    if (record.isVerified)
      throw new RpcException({
        message: 'OTP already verified',
        code: 'OTP_ALREADY_VERIFIED',
      });
    if (record.expiresAt < new Date())
      throw new RpcException({
        message: 'OTP has expired',
        code: 'OTP_EXPIRED',
      });

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);
    if (!isValid)
      throw new RpcException({
        message: 'Invalid OTP or amount mismatch',
        code: 'INVALID_OTP_OR_AMOUNT_MISMATCH',
      });

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

    if (!beneficiary)
      throw new RpcException({
        message: 'Beneficiary not found',
        code: 'PAYOUT_ERR_BENEFICIARY_NOT_FOUND',
      });
    if (!beneficiary.groupedBeneficiaries)
      throw new RpcException({
        message: 'Beneficiary has no grouped beneficiaries',
        code: 'BENEFICIARY_NO_GROUPED_BENEFICIARIES',
      });

    const payoutEligibleGroups = beneficiary.groupedBeneficiaries.filter(
      (g: any) => g.groupPurpose !== 'COMMUNICATION'
    );

    if (!payoutEligibleGroups.length)
      throw new RpcException({
        message: 'No payout-eligible group found for beneficiary',
        code: 'PAYOUT_ERR_NO_ELIGIBLE_GROUP',
      });

    // A beneficiary can sit in several payout-eligible groups (e.g. an old group plus the one
    // used for a re-assignment). Resolve by the group that has an active payout instead of
    // rejecting outright.
    const beneficiaryGroups = await this.prisma.beneficiaryGroups.findMany({
      where: {
        uuid: { in: payoutEligibleGroups.map((g: any) => g.beneficiaryGroupId) },
      },
      include: { tokensReserved: { include: { payout: true } } },
    });

    if (!beneficiaryGroups.length)
      throw new RpcException({
        message: 'Beneficiary group not found',
        code: 'PAYOUT_ERR_GROUP_NOT_FOUND',
      });

    const candidates = beneficiaryGroups.flatMap((group) =>
      group.tokensReserved
        .filter(
          (t) =>
            t.isDisbursed === true &&
            t.payout?.status !== 'COMPLETED' &&
            !(t.payout?.extras as any)?.skippedAt
        )
        .map((token) => ({ group, token }))
    );

    this.logger.log(
      `[SendOtp] phone=${phone}: ${payoutEligibleGroups.length} eligible group(s), ${candidates.length} active token(s) [${candidates
        .map((c) => `${c.group.uuid}/${c.token.uuid}`)
        .join(', ')}]`
    );

    if (!candidates.length) {
      this.logger.error('No active payout found for the group');
      throw new RpcException({
        message: 'No active payout found for the group',
        code: 'NO_ACTIVE_PAYOUT_FOUND_FOR_GROUP',
      });
    }

    // genuinely ambiguous only when active payouts exist in more than one group
    if (new Set(candidates.map((c) => c.group.uuid)).size > 1)
      throw new RpcException({
        message: 'Multiple payout-eligible groups found for beneficiary',
        code: 'MULTIPLE_PAYOUT_ELIGIBLE_GROUPS_FOUND',
      });

    return candidates[0].token.payout;
  }

  private async sendOtpByPhone(data: SendOtpDto, payoutId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: data.vendorUuid },
    });
    if (!vendor)
      throw new RpcException({
        message: 'Vendor not found',
        code: 'PAYOUT_ERR_VENDOR_NOT_FOUND',
      });

    const keys = (await this.getSecretByPhone(data.phoneNumber)) as any;
    if (!keys)
      throw new RpcException({
        message: 'Beneficiary address not found',
        code: 'PAYOUT_ERR_BENEFICIARY_ADDRESS_NOT_FOUND',
      });

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
      throw new RpcException({
        message: 'Beneficiary token balance not found',
        code: 'STELLAR_ERR_TOKEN_BALANCE_NOT_FOUND',
      });

    const amount = data.amount || beneficiaryTokenBalance;
    if (Number(amount) > beneficiaryTokenBalance)
      throw new RpcException({
        message: `Requested amount ${amount} exceeds available balance ${beneficiaryTokenBalance}`,
        code: 'PAYOUT_ERR_AMOUNT_EXCEEDS_BALANCE',
        params: { amount, balance: beneficiaryTokenBalance },
      });
    if (Number(amount) <= 0)
      throw new RpcException({
        message: 'Amount must be greater than 0',
        code: 'PAYOUT_ERR_AMOUNT_NOT_POSITIVE',
      });

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

  /**
   * Reads the consolidated STELLAR_DISBURSEMENT_SETTINGS object.
   * STELLAR_DISBURSMENT_MODE toggles 'SDP' (STELLAR_SDP queue) vs 'DIRECT' (STELLAR_DISBURSE queue);
   * defaults to 'SDP' if not configured.
   */
  private async getDisbursementSettings(): Promise<{
    CHECK_TRUSTLINE: boolean;
    STELLAR_DISBURSMENT_MODE: 'SDP' | 'DIRECT';
    STELLAR_DISTRUBUTION_WALLET_SECRET: string;
  }> {
    const settings = await this.getFromSettings(
      'STELLAR_DISBURSEMENT_SETTINGS'
    );
    const value = (settings as Record<string, unknown>) || {};
    return {
      CHECK_TRUSTLINE: value.CHECK_TRUSTLINE === true,
      STELLAR_DISBURSMENT_MODE:
        value.STELLAR_DISBURSMENT_MODE === 'DIRECT' ? 'DIRECT' : 'SDP',
      STELLAR_DISTRUBUTION_WALLET_SECRET:
        (value.STELLAR_DISTRUBUTION_WALLET_SECRET as string) || '',
    };
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
