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
  TransferTokensDto,
  VerifyOtpDto,
  AddTriggerDto,
  UpdateTriggerDto,
  RedeemInkindDto,
  RedeemInkindTokenForCashDto,
} from '../interfaces/chain-service.interface';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SendAssetDto } from '../../stellar/dto/send-otp.dto';
import { getFormattedTimeDiff } from '../../utils/date';
import { lastValueFrom } from 'rxjs';

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
      `Starting stellar SDP disbursement for ${data.dName} with groups: ${data.groups || 'all'}`
    );

    const groupUuids =
      data?.groups && data.groups.length > 0
        ? data.groups
        : await this.getDisbursableGroupsUuids();

    this.logger.debug(`Resolved ${groupUuids.length} group UUIDs for disbursement`);

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
      if (!tokensReserved) {
        this.logger.warn(`Group ${uuid} has no token reservation, skipping`);
        continue;
      }
      const dName = `${tokensReserved.title.toLocaleLowerCase()}_${data.dName}`;
      this.logger.debug(
        `Queuing SDP disbursement job for group ${uuid} with ${tokensReserved.numberOfTokens} tokens, dName: ${dName}`
      );
      await this.stellarSdpQueue.add(
        JOBS.STELLAR_SDP.DISBURSE,
        {
          dName,
          groups: [uuid],
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

  async getDisbursementStats(): Promise<any> {
    this.logger.log('Fetching disbursement stats for Stellar SDP chain');

    const oneTokenPrice =
      Number(await this.getFromSettings('ONE_TOKEN_PRICE')) || 1;
    const tokenName =
      String((await this.getFromSettings('ASSETCODE')) ?? 'RAHAT');

    this.logger.debug(`Token price: ${oneTokenPrice}, Token name: ${tokenName}`);

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
          escape(ben.name),
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

  async sendOtp(_data: SendOtpDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
  }

  async sendAssetToVendor(_data: SendAssetDto): Promise<any> {
    throw new RpcException('Not supported on Stellar SDP chain');
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
          { payout: { is: null } },
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
      where: { groupId: { in: groupUuids } },
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
        const name =
          Beneficiary.pii?.name || Beneficiary.name || walletAddress;
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
    this.logger.debug(`Token distribution computed for ${result.length} beneficiaries`);
    return result;
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
