import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { SdpClient } from '@rahataid/stellar-sdp';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { lastValueFrom } from 'rxjs';
import bcrypt from 'bcryptjs';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import {
  AddTokenToGroup,
  AssignBenfGroupToProject,
  CreateBeneficiaryDto,
  CreateBulkBeneficiaryDto,
} from './dto/create-beneficiary.dto';
import { GetBenfGroupDto, getGroupByUuidDto } from './dto/get-group.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { UpdateBeneficiaryGroupTokenDto } from './dto/update-benf-group-token.dto';
import { GroupPurpose, PayoutType, Prisma } from '@prisma/client';
import { QrPdfService } from './qr-pdf.service';
import axios from 'axios';
import { SettingsService } from '@rumsan/settings';
import { ethers } from 'ethers';
import { PayoutsService } from '../payouts/payouts.service';
import { REDEEM_COMPLETED_STATUSES } from '../utils/getBeneficiaryRedemStatus';
import { createContractInstance } from '../utils/web3';
import { SseService } from '../sse/sse.service';
import { RedisService } from '../redis/redis.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });
const BATCH_SIZE = 50;
const DISBURSE_CACHE_TTL = 300;
const DISBURSE_CACHE_KEY_PREFIX = 'disburse:progress:';

interface DataItem {
  groupId: UUID;
  [key: string]: any;
}

interface PaginateResult<T> {
  data: T[];
  meta: any;
}

@Injectable()
export class BeneficiaryService {
  private rsprisma;
  private readonly logger = new Logger(BeneficiaryService.name);
  private sdpClient: SdpClient | null = null;
  constructor(
    protected prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => PayoutsService))
    private readonly payoutService: PayoutsService,
    private readonly qrPdfService: QrPdfService,
    private readonly sseService: SseService,
    private readonly redisService: RedisService
  ) {
    this.rsprisma = prisma.rsclient;
  }

  initiateQrPdf(groupId: string) {
    return this.qrPdfService.initiateQrPdf(groupId);
  }

  getQrPdf(groupId: string) {
    return this.qrPdfService.getJobStatus(groupId);
  }

  async getAllBenfs() {
    this.logger.debug('Fetching all beneficiaries');
    return this.prisma.beneficiary.findMany();
  }

  async getCount() {
    this.logger.debug('Getting active beneficiary count');
    return this.prisma.beneficiary.count({
      where: {
        deletedAt: null,
      },
    });
  }

  async getBenfBetweenIds(startId: number, endId: number) {
    this.logger.debug(`Fetching beneficiaries between ids ${startId}-${endId}`);
    return this.prisma.beneficiary.findMany({
      where: {
        id: {
          gte: startId,
          lte: endId,
        },
      },
    });
  }

  async create(dto: CreateBeneficiaryDto) {
    this.logger.debug('Creating beneficiary');
    const { isVerified, ...rest } = dto;
    const rdata = await this.rsprisma.beneficiary.create({
      data: rest,
    });
    this.logger.log(`Beneficiary created: ${rdata.uuid}`);
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);
    await this.seedOtpsForBeneficiaries([dto]);
    return rdata;
  }

  async createBulk(dto: CreateBulkBeneficiaryDto) {
    const { beneficiaries } = dto;
    this.logger.debug(
      `Creating bulk beneficiaries, count: ${beneficiaries.length}`
    );

    const processedBeneficiaries = beneficiaries.map(
      ({ isVerified, ...rest }) => rest
    );

    const rdata = await this.rsprisma.beneficiary.createMany({
      data: processedBeneficiaries,
      skipDuplicates: true,
    });

    this.logger.log(`Bulk beneficiaries created: ${rdata.count}`);
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);
    await this.seedOtpsForBeneficiaries(processedBeneficiaries);
    return rdata;
  }

  async createMany(dto) {
    this.logger.debug(
      `Creating many beneficiaries, count: ${dto?.length ?? 'unknown'}`
    );
    const rdata = await this.rsprisma.beneficiary.createMany({
      data: dto,
      skipDuplicates: true,
    });

    this.logger.log(`Beneficiaries created: ${rdata.count}`);
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);

    return rdata;
  }

  async findAll(dto) {
    const { page, perPage, sort, order } = dto;
    this.logger.debug(
      `Finding all beneficiaries - page: ${page}, perPage: ${perPage}, sort: ${sort} ${order}`
    );

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const projectData = await paginate(
      this.rsprisma.beneficiary,
      {
        where: {
          deletedAt: null,
        },
        orderBy,
      },
      {
        page,
        perPage,
      }
    );
    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.list_by_project' },
      projectData
    );
  }

  async getAllGroups(dto: GetBenfGroupDto) {
    this.logger.log('Getting all beneficiary groups data');
    const {
      page,
      perPage,
      sort,
      order,
      tokenAssigned,
      search,
      hasPayout,
      excludeGroupPurpose,
    } = dto;
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const where: Prisma.BeneficiaryGroupsWhereInput = {
      AND: [
        { deletedAt: null },
        {
          ...(tokenAssigned === true
            ? { tokensReserved: { some: { isDisbursed: true } } }
            : tokenAssigned === false
            ? {
                OR: [
                  { tokensReserved: { none: {} } },
                  { tokensReserved: { some: { isDisbursed: true } } },
                ],
                groupPurpose: { not: GroupPurpose.COMMUNICATION },
              }
            : {}),
        },
        {
          ...(hasPayout === true
            ? { tokensReserved: { some: { payoutId: { not: null } } } }
            : hasPayout === false
            ? {
                tokensReserved: { some: { payoutId: null, isDisbursed: true } },
              }
            : {}),
        },
        {
          ...(search && {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          }),
        },
        {
          ...(excludeGroupPurpose && {
            groupPurpose: { not: excludeGroupPurpose },
          }),
        },
      ],
    };

    const query = {
      where,
      include: {
        _count: {
          select: {
            beneficiaries: true,
          },
        },
        tokensReserved: true,
      },
      orderBy,
    };

    if (page === undefined || perPage === undefined) {
      const data = await this.prisma.beneficiaryGroups.findMany(query);

      return {
        data,
        meta: {
          total: data.length,
        },
      };
    }

    const benfGroups = await paginate(this.prisma.beneficiaryGroups, query, {
      page,
      perPage,
    });

    this.logger.debug(
      `Fetched ${benfGroups.data.length} groups, forwarding to project service`
    );

    // this code effect performance and this data is not needed for getAllGroups API, so commenting out for now. We can revisit if project service needs this data.
    // const res = await lastValueFrom(
    //   this.client.send(
    //     { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
    //     benfGroups
    //   )
    // );

    // res.data = res.data.map((group) => {
    //   let updatedGroup = group;
    //   benfGroups.data.forEach((benfGroup: any) => {
    //     if (group?.uuid === benfGroup?.uuid) {
    //       updatedGroup = {
    //         ...group,
    //         tokensReserved: benfGroup.tokensReserved,
    //       };
    //     }
    //   });
    //   return updatedGroup;
    // });

    return benfGroups;
  }

  async getAllGroupsByUuids(payload: getGroupByUuidDto) {
    this.logger.log('Fetching all beneficiary group by group uuids');
    const { uuids, selectField } = payload;
    this.logger.debug(
      `Group uuids: ${uuids.length}, selectFields: ${
        selectField?.join(',') ?? 'all'
      }`
    );
    try {
      let selectFields;

      if (selectField && selectField.length > 0) {
        // Convert fields array into an object for Prisma select
        selectFields = selectField.reduce((acc, field) => {
          acc[field] = true;
          return acc;
        }, {});
      }

      const groups = await this.prisma.beneficiaryGroups.findMany({
        where: {
          uuid: {
            in: uuids,
          },
        },
        ...(selectFields ? { select: selectFields } : {}),
      });

      this.logger.debug(`Found ${groups.length} groups`);
      return groups;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error fetching beneficiary groups by uuids: ${errMsg}`
      );
      throw new RpcException(
        `Error while fetching beneficiary groups by uuids. ${errMsg}`
      );
    }
  }

  async findByUUID(uuid: UUID) {
    this.logger.debug(`Finding beneficiary by UUID: ${uuid}`);
    return await this.rsprisma.beneficiary.findUnique({ where: { uuid } });
  }

  async findOne(payload) {
    const { uuid, data } = payload;
    this.logger.debug(`Finding beneficiary: ${uuid}`);
    const projectBendata = await this.rsprisma.beneficiary.findUnique({
      where: { uuid },
    });
    if (data) return { ...data, ...projectBendata };
    return projectBendata;
  }

  async findTokenDetails(payload) {
    const { uuid } = payload;
    this.logger.debug(`Fetching token details for beneficiary: ${uuid}`);
    const contractSettings = await this.prisma.setting.findUnique({
      where: {
        name: 'CONTRACT',
      },
    });
    const formattedValue = contractSettings?.value as any;
    const rahatTokenAddress = formattedValue?.RAHATTOKEN?.ADDRESS;
    this.logger.debug(`Using token address: ${rahatTokenAddress}`);
    const projectContract = await createContractInstance(
      'AAPROJECT',
      this.prisma.setting
    );
    const tokenContract = await createContractInstance(
      'RAHATTOKEN',
      this.prisma.setting
    );

    const tokenAllocation = await projectContract.benTokens.staticCall(
      rahatTokenAddress
    );
    const decimal = await tokenContract?.decimals.staticCall();
    const benDetails = await this.prisma.beneficiary.findUnique({
      where: {
        uuid,
      },
      select: {
        benTokens: true,
        BeneficiaryRedeem: {
          select: {
            amount: true,
          },
        },
      },
    });

    const redemeedToken = benDetails?.BeneficiaryRedeem?.reduce(
      (sum, item) => sum + Number(item.amount ?? item?.amount ?? 0),
      0
    );
    this.logger.debug(
      `Token details for ${uuid} - available: ${ethers.formatUnits(
        tokenAllocation,
        decimal
      )}, assigned: ${benDetails?.benTokens}, redeemed: ${redemeedToken}`
    );
    return {
      availableToken: ethers.formatUnits(tokenAllocation, decimal),
      assignedToken: benDetails?.benTokens,
      redemmedToken: redemeedToken,
    };
  }

  async findOneBeneficiary(payload) {
    const { uuid, data } = payload;
    this.logger.debug(`Finding one beneficiary for project: ${uuid}`);
    const projectBendata = await this.rsprisma.beneficiary.findUnique({
      where: { uuid },
    });
    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.find_one_beneficiary' },
      projectBendata
    );
  }

  async findOneBeneficiaryByWalletAddress(walletAddress: string) {
    this.logger.debug('Finding beneficiary by wallet address');
    return this.rsprisma.beneficiary.findUnique({
      where: { walletAddress },
    });
  }

  async update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    this.logger.debug(`Updating beneficiary id: ${id}`);
    const rdata = await this.rsprisma.beneficiary.update({
      where: { id: id },
      data: { ...updateBeneficiaryDto },
    });

    this.logger.log(`Beneficiary updated: ${rdata.uuid}`);
    this.eventEmitter.emit(EVENTS.BENEFICIARY_UPDATED);

    return rdata;
  }

  async remove(payload: any) {
    const uuid = payload.uuid;
    this.logger.debug(`Removing beneficiary: ${uuid}`);
    const findUuid = await this.rsprisma.beneficiary.findUnique({
      where: {
        uuid,
      },
    });

    if (!findUuid) {
      this.logger.warn(`Beneficiary not found for removal: ${uuid}`);
      return 'OK';
    }

    const rdata = await this.rsprisma.beneficiary.update({
      where: {
        uuid,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    this.logger.log(`Beneficiary soft-deleted: ${uuid}`);
    this.eventEmitter.emit(EVENTS.BENEFICIARY_REMOVED);

    return rdata;
  }

  // *****  beneficiary groups ********** //
  async getOneGroup(uuid: UUID) {
    const benfGroup = await this.prisma.beneficiaryGroups.findUnique({
      where: {
        uuid: uuid,
        deletedAt: null,
      },
      include: {
        tokensReserved: true,
        beneficiaries: {
          include: {
            beneficiary: true,
          },
        },
      },
    });

    if (!benfGroup) throw new RpcException('Beneficiary group not found.');

    const data = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
        benfGroup.uuid
      )
    );

    return data;
  }

  async addGroupToProject(payload: AssignBenfGroupToProject) {
    const { beneficiaryGroupData } = payload;
    this.logger.debug(
      `Adding beneficiary group ${beneficiaryGroupData.uuid} to project`
    );
    const group = await this.prisma.beneficiaryGroups.create({
      data: {
        uuid: beneficiaryGroupData.uuid,
        name: beneficiaryGroupData.name,
        groupPurpose: beneficiaryGroupData.groupPurpose,
      },
    });

    const groupedBeneficiaries =
      await this.prisma.beneficiaryToGroup.createMany({
        data: beneficiaryGroupData.groupedBeneficiaries.map((beneficiary) => ({
          beneficiaryId: beneficiary.beneficiaryId,
          groupId: beneficiaryGroupData.uuid,
        })),
      });

    this.logger.debug(
      `New Beneficiary group ${group.name} added to project with ${groupedBeneficiaries.count} beneficiaries.`
    );

    this.eventEmitter.emit(EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT, {
      groupUuid: beneficiaryGroupData.uuid,
    });

    return {
      group,
      groupedBeneficiaries,
    };
  }

  /**
   * Called from the core repo (e.g. when a project closes) to tear down a
   * group's Stellar sponsorship. Just emits the event — StellarSponsorService
   * (stellar-sponsor.service.ts) picks it up, batches the group's
   * beneficiaries, and closes out their sponsored accounts (trustline close +
   * accountMerge) if the chain is Stellar and sponsorship is configured; a
   * no-op otherwise. This method doesn't touch beneficiary records directly.
   */
  async revokeSponsorshipForGroup(payload: { groupUuid: string }) {
    const { groupUuid } = payload;
    this.logger.debug(
      `Received revoke-sponsorship request for group ${groupUuid}`
    );

    this.eventEmitter.emit(EVENTS.BENEFICIARY_GROUP_SPONSORSHIP_REVOKE, {
      groupUuid,
    });

    return { groupUuid, queued: true };
  }

  /**
   * Called from the core repo to re-attempt Stellar sponsorship for a
   * group's not-yet-sponsored beneficiaries — e.g. after a transient
   * failure (insufficient sponsor balance, network error) is resolved.
   * Checks current status first via `getSponsorshipStatusForGroup` and:
   *  - no-ops if the chain isn't Stellar, or every beneficiary is already sponsored.
   *  - otherwise re-emits BENEFICIARY_GROUP_ADDED_TO_PROJECT, the same event
   *    that first triggers sponsorship. Safe to re-run: the underlying batch
   *    (`createSponsoredAccountsBatch`) already skips accounts it finds
   *    already sponsored, so already-sponsored beneficiaries in the group
   *    aren't touched again.
   * `no-wallet` beneficiaries are reported separately since retrying can
   * never fix them — they need a wallet address before sponsorship can even
   * be attempted.
   */
  async retrySponsorshipForGroup(payload: { groupUuid: string }) {
    const { groupUuid } = payload;
    this.logger.debug(
      `Received retry-sponsorship request for group ${groupUuid}`
    );

    const status = await this.getSponsorshipStatusForGroup({ groupUuid });

    if (!status.isStellarChain) {
      return {
        ...status,
        queued: false,
        reason: 'Chain is not Stellar — sponsorship does not apply',
      };
    }

    const retriable = status.pending + status.failed;
    if (retriable === 0) {
      return {
        ...status,
        queued: false,
        reason: 'No pending or failed beneficiaries to retry',
      };
    }

    this.logger.log(
      `Retrying sponsorship for group ${groupUuid}: ${retriable} beneficiary/ies eligible (pending: ${status.pending}, failed: ${status.failed}, no-wallet skipped: ${status.noWallet})`
    );
    this.eventEmitter.emit(EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT, {
      groupUuid,
    });

    return { ...status, queued: true, retrying: retriable };
  }

  /**
   * Reports Stellar sponsorship status for every beneficiary in a group, by
   * reading what StellarSponsorProcessor has already written to
   * `beneficiary.extras` — no live Stellar calls. Returns `isStellarChain:
   * false` with all counts zeroed (no DB scan) when the project's chain
   * isn't Stellar — sponsorship doesn't apply, so there's nothing to report.
   * Status per beneficiary:
   *  - `sponsored`: extras.stellarSponsored === true (extras.stellarSponsorAction says how — create/trustline-only/already-sponsored)
   *  - `failed`: extras.stellarSponsorError is set (the error message is the reason)
   *  - `no-wallet`: beneficiary has no walletAddress on file — was never even queued
   *  - `pending`: none of the above — not yet processed (queued-but-not-run and never-triggered both land here; this doesn't inspect live queue state)
   */
  async getSponsorshipStatusForGroup(payload: { groupUuid: string }) {
    const { groupUuid } = payload;

    if (!(await this.isStellarChain())) {
      return {
        groupUuid,
        isStellarChain: false,
        total: 0,
        sponsored: 0,
        pending: 0,
        failed: 0,
        noWallet: 0,
        accounts: [],
      };
    }

    const records = await this.prisma.beneficiaryToGroup.findMany({
      where: { groupId: groupUuid },
      select: {
        beneficiary: {
          select: { uuid: true, walletAddress: true, extras: true },
        },
      },
    });

    const accounts = records.map(({ beneficiary }) => {
      const extras = (beneficiary.extras as Record<string, unknown>) ?? {};
      const base = {
        beneficiaryId: beneficiary.uuid,
        walletAddress: beneficiary.walletAddress || null,
      };

      if (!beneficiary.walletAddress) {
        return {
          ...base,
          status: 'no-wallet' as const,
          reason: 'No wallet address on file',
        };
      }
      if (extras.stellarSponsored === true) {
        return {
          ...base,
          status: 'sponsored' as const,
          action: extras.stellarSponsorAction as string | undefined,
        };
      }
      if (typeof extras.stellarSponsorError === 'string') {
        return {
          ...base,
          status: 'failed' as const,
          reason: extras.stellarSponsorError,
          failedAt: extras.stellarSponsorFailedAt as string | undefined,
        };
      }
      return { ...base, status: 'pending' as const };
    });

    return {
      groupUuid,
      isStellarChain: true,
      total: accounts.length,
      sponsored: accounts.filter((a) => a.status === 'sponsored').length,
      pending: accounts.filter((a) => a.status === 'pending').length,
      failed: accounts.filter((a) => a.status === 'failed').length,
      noWallet: accounts.filter((a) => a.status === 'no-wallet').length,
      accounts,
    };
  }

  private async isStellarChain(): Promise<boolean> {
    try {
      const chainSettings = await this.settingsService.getPublic(
        'CHAIN_SETTINGS'
      );
      return (chainSettings?.value as any)?.type === 'stellar';
    } catch (err: any) {
      this.logger.warn(`Failed to load CHAIN_SETTINGS: ${err?.message}`);
      return false;
    }
  }

  async checkIsTokenAlreadyAssigned(groupId: UUID) {
    this.logger.debug(`Checking token assignment for group: ${groupId}`);
    const group = await this.getOneGroup(groupId);

    const benfIdsAndWalletAddress = group.groupedBeneficiaries.map(
      (d: any) => ({
        uuid: d?.Beneficiary?.uuid,
        walletAddress: d?.Beneficiary?.walletAddress,
      })
    );

    const tokenAssignedBenfWallet: string[] = [];
    const foundAssignedBenf: string[] = [];
    const fiatRedeemNotCompleted: string[] = [];

    for (const benf of benfIdsAndWalletAddress) {
      // Step 1: get all groups this benf belongs to that have any token record
      const tokenAssignedGroups = await this.prisma.beneficiaryGroups.findMany({
        where: {
          tokensReserved: { some: {} },
          beneficiaries: { some: { beneficiaryId: { equals: benf.uuid } } },
        },
        include: { tokensReserved: { include: { payout: true } } },
      });

      if (tokenAssignedGroups.length === 0) continue;

      // Step 2: check across all groups - if ANY group has a NOT_DISBURSED token → blocked
      const hasNotDisbursed = tokenAssignedGroups.some((g) =>
        g.tokensReserved.some((t) => t.isDisbursed === false)
      );

      if (hasNotDisbursed) {
        tokenAssignedBenfWallet.push(benf.walletAddress);
        continue;
      }

      // Step 3: all tokens are DISBURSED — check payout status for each disbursed token
      const disbursedTokens = tokenAssignedGroups.flatMap((g) =>
        g.tokensReserved.filter((t) => t.isDisbursed)
      );

      for (const token of disbursedTokens) {
        // no payout created yet → still blocked
        if (!token.payoutId) {
          tokenAssignedBenfWallet.push(benf.walletAddress);
          break;
        }

        const payout = token.payout;

        if (!payout || payout.status === 'NOT_STARTED') {
          tokenAssignedBenfWallet.push(benf.walletAddress);
          break;
        }

        if (payout.status === 'COMPLETED') {
          // this cycle is fully done — benf is eligible for a new assignment
          continue;
        }

        // payout in progress — first check token transaction is completed
        const tokenRedeem = await this.prisma.beneficiaryRedeem.findFirst({
          where: {
            beneficiaryWalletAddress: benf.walletAddress,
            payoutId: payout.uuid,
            status: 'TOKEN_TRANSACTION_COMPLETED',
          },
        });

        if (!tokenRedeem) {
          foundAssignedBenf.push(benf.walletAddress);
          break;
        }

        // token done — check fiat/cash redeem is also completed
        const fiatRedeem = await this.prisma.beneficiaryRedeem.findFirst({
          where: {
            beneficiaryWalletAddress: benf.walletAddress,
            payoutId: payout.uuid,
            status: { in: ['FIAT_TRANSACTION_COMPLETED', 'COMPLETED'] },
          },
        });

        if (!fiatRedeem) {
          fiatRedeemNotCompleted.push(benf.walletAddress);
          break;
        }
      }
    }

    if (tokenAssignedBenfWallet.length > 0 || foundAssignedBenf.length > 0) {
      this.logger.warn(
        `Token conflict found for group: ${groupId} — NOT_DISBURSED: ${tokenAssignedBenfWallet.length}, pending token redeem: ${foundAssignedBenf.length}, pending fiat redeem: ${fiatRedeemNotCompleted.length}`
      );
      return {
        isAssignable: false,
        status: 'error',
        message:
          'Tokens have already been assigned to the following beneficiaries wallet addresses',
        tokenAssignedBenfWallet,
        foundAssignedBenf,
        groupName: group.name,
      };
    }

    this.logger.debug(`No token conflicts found for group: ${groupId}`);
    return {
      isAssignable: true,
      status: 'success',
      message: 'No tokens have been assigned yet. Tokens can be assigned.',
      groupName: group.name,
      fiatRedeemNotCompleted,
    };
  }

  async reserveTokenToGroup(payload: AddTokenToGroup) {
    const {
      beneficiaryGroupId,
      title,
      totalTokensReserved,
      user,
      isPayoutIntegrated,
      params,
    } = payload;

    this.logger.debug(
      `Reserving ${totalTokensReserved} tokens for group: ${beneficiaryGroupId}`
    );

    const isAlreadyReserved =
      await this.prisma.beneficiaryGroupTokens.findFirst({
        where: { groupId: beneficiaryGroupId, status: 'NOT_DISBURSED' },
      });

    if (isAlreadyReserved) {
      this.logger.warn(
        `Token already reserved for group: ${beneficiaryGroupId}`
      );
      throw new RpcException('Token already reserved.');
    }

    const benfGroup = await this.prisma.beneficiaryGroups.findUnique({
      where: {
        uuid: beneficiaryGroupId,
      },
    });

    if (!benfGroup) {
      this.logger.warn(`Beneficiary group not found: ${beneficiaryGroupId}`);
      throw new RpcException('Beneficiary group not found.');
    }

    const allowedPurposes: (GroupPurpose | null)[] = [
      GroupPurpose.BANK_TRANSFER,
      GroupPurpose.MOBILE_MONEY,
      GroupPurpose.GENERAL,
    ];

    if (!allowedPurposes.includes(benfGroup.groupPurpose)) {
      this.logger.warn(
        `Invalid group purpose ${benfGroup.groupPurpose} for group: ${beneficiaryGroupId}`
      );
      throw new RpcException(
        `Invalid group purpose ${benfGroup.groupPurpose}. Allowed purposes: BANK_TRANSFER, MOBILE_MONEY, GENERAL.`
      );
    }

    if (benfGroup.groupPurpose === GroupPurpose.GENERAL) {
      const isVendorWithGeneral = params?.type === PayoutType.VENDOR;
      const isNoPayoutWithGeneral = !isPayoutIntegrated;

      if (!isVendorWithGeneral && !isNoPayoutWithGeneral) {
        this.logger.warn(
          `Group purpose GENERAL not allowed for group: ${beneficiaryGroupId} with payout type: ${params?.type}, isPayoutIntegrated: ${isPayoutIntegrated}`
        );
        throw new RpcException(
          `Group purpose GENERAL is only allowed for VENDOR payouts. Received payout type: ${
            params?.type ?? 'none'
          }, `
        );
      }
    }

    const tokenAssignmentCheck = await this.checkIsTokenAlreadyAssigned(
      beneficiaryGroupId as UUID
    );

    if (!tokenAssignmentCheck.isAssignable) {
      return tokenAssignmentCheck;
    }

    const sponsorshipStatus = await this.getSponsorshipStatusForGroup({
      groupUuid: beneficiaryGroupId,
    });
    if (sponsorshipStatus.isStellarChain) {
      const notSponsored =
        sponsorshipStatus.total - sponsorshipStatus.sponsored;
      if (notSponsored > 0) {
        this.logger.warn(
          `Group ${beneficiaryGroupId} has ${notSponsored}/${sponsorshipStatus.total} beneficiary/ies not yet sponsored on Stellar (pending: ${sponsorshipStatus.pending}, failed: ${sponsorshipStatus.failed}, no-wallet: ${sponsorshipStatus.noWallet}) — refusing to reserve tokens`
        );
        throw new RpcException(
          'Beneficiary sponsorship is still in progress for this group. Please wait until all beneficiaries are sponsored before assigning funds.'
        );
      }
    }

    // Tx definies a single transaction with a number of operations that either all succeed or all fail together
    // Which is crucial for maintaining data integrity when reserving tokens and creating payouts.
    const createTokenReservation = this.prisma.$transaction(async (tx) => {
      const data = await tx.beneficiaryGroupTokens.create({
        data: {
          title,
          groupId: beneficiaryGroupId,
          numberOfTokens: totalTokensReserved,
          createdBy: user?.name,
        },
      });

      this.logger.log(
        `Tokens reserved for group ${beneficiaryGroupId}: ${totalTokensReserved}`
      );

      if (isPayoutIntegrated && params) {
        this.logger.debug(
          `Creating integrated payout for group: ${beneficiaryGroupId}`
        );
        await this.payoutService.create(
          {
            type: params.type,
            groupId: data.uuid,
            mode: params.mode,
            extras: params.extras,
            payoutProcessorId: params.payoutProcessorId,
            status: params.status,
            user: user,
            disbursementStatus: 'NOT_DISBURSED',
          },
          tx as any
        );
      }

      this.eventEmitter.emit(EVENTS.TOKEN_RESERVED);
      this.eventEmitter.emit(EVENTS.GROUP_TOKEN_RESERVED_FOR_DISBURSE, {
        groupUuid: beneficiaryGroupId,
        groupName: benfGroup.name,
        title,
      });

      return {
        status: 'success',
        message: `Successfully reserved ${totalTokensReserved} tokens for group ${benfGroup.name}.`,
      };
    });
    await this.sseService.publishEvent('fund.event', createTokenReservation);
    return createTokenReservation;
  }

  async getAllTokenReservations(dto) {
    const { page, perPage, sort, order } = dto;
    this.logger.debug(
      `Fetching all token reservations - page: ${page}, perPage: ${perPage}`
    );

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const { data, meta }: PaginateResult<DataItem> = await paginate(
      this.prisma.beneficiaryGroupTokens,
      {
        orderBy,
      },
      {
        page,
        perPage,
      }
    );

    this.logger.debug(
      `Fetched ${data.length} token reservations, enriching with group data`
    );

    const formattedData: Array<
      DataItem & { group: ReturnType<typeof this.getOneGroup> }
    > = [];

    const disburseOnCreate = await this.settingsService
      .getPublic('DISBURSED_ON_CREATE')
      .catch(() => null);

    const shouldSyncFromSdp =
      disburseOnCreate?.value === true &&
      (await this.isTokenPayoutPhaseActive());

    for (const d of data) {
      const group = await this.getOneGroup(d['groupId'] as UUID);
      const synced = shouldSyncFromSdp
        ? await this.syncDisbursementStatusFromSdp(d)
        : null;

      const groupUuid = d['groupId'] as string;
      const cachedProgress = await this.getDisburseProgressCache(groupUuid);

      const totalBeneficiaries =
        cachedProgress?.totalBeneficiaries ||
        (await this.getBeneficiaryCountByGroup(groupUuid));

      const totalSuccess = cachedProgress
        ? cachedProgress.completedCount
        : d['isDisbursed']
        ? totalBeneficiaries
        : 0;

      formattedData.push({
        ...d,
        ...synced,
        group,
        totalBeneficiaries,
        totalSuccess,
      });
    }

    return {
      data: formattedData,
      meta,
    };
  }

  private async isTokenPayoutPhaseActive(): Promise<boolean> {
    try {
      const projectInfo = await this.settingsService.getPublic('PROJECTINFO');
      const activeYear = (projectInfo?.value as any)?.['ACTIVE_YEAR'];
      const riverBasin = (projectInfo?.value as any)?.['RIVER_BASIN'];

      if (!activeYear || !riverBasin) {
        this.logger.warn(
          'Active year or river basin not found in PROJECTINFO settings'
        );
        return false;
      }

      const { isPayoutMethodPhaseActivated } = await lastValueFrom(
        this.client.send(
          { cmd: 'ms.jobs.phase.getPhasePayoutStatus' },
          { activeYear, riverBasin, disbursementMethod: 'TOKEN' }
        )
      );

      return Boolean(isPayoutMethodPhaseActivated);
    } catch (error) {
      this.logger.error(`Failed to check token payout phase status: ${error}`);
      return false;
    }
  }

  private async syncDisbursementStatusFromSdp(
    tokenReservation: DataItem
  ): Promise<Partial<DataItem> | null> {
    if (tokenReservation['status'] === 'DISBURSED') return null;

    const disbursementId = (tokenReservation['info'] as any)?.disbursement?.id;
    if (!disbursementId) return null;

    try {
      const sdpClient = await this.getSdpClient();
      const disbursement = await sdpClient.disbursements.get(disbursementId);
      const sdpStatus = disbursement.status?.toUpperCase();

      if (!sdpStatus || sdpStatus === tokenReservation['status']) return null;

      const isDisbursed = sdpStatus === 'COMPLETED';
      const status = isDisbursed
        ? 'DISBURSED'
        : sdpStatus === 'FAILED' || sdpStatus === 'ERROR'
        ? 'FAILED'
        : sdpStatus === 'STARTED'
        ? 'STARTED'
        : tokenReservation['status'];

      if (status === tokenReservation['status']) return null;

      const groupUuid = tokenReservation['groupId'];
      const updatePayload = {
        groupUuid,
        status,
        isDisbursed,
        info: {
          ...(tokenReservation['info'] as any),
          disbursement,
          ...(isDisbursed && { completedAt: new Date().toISOString() }),
        },
      };

      this.updateGroupToken(updatePayload).catch((error) =>
        this.logger.error(
          `Failed to persist synced disbursement status for group ${groupUuid}: ${error}`
        )
      );

      return { status, isDisbursed };
    } catch (error) {
      this.logger.error(
        `Failed to sync SDP disbursement status for ${disbursementId}: ${error}`
      );
      return null;
    }
  }

  private async getSdpClient(): Promise<SdpClient> {
    if (this.sdpClient) return this.sdpClient;

    const sdpSettings = await this.settingsService.getPublic('SDP_SETTINGS');
    if (!sdpSettings?.value) {
      throw new Error('SDP_SETTINGS not found in settings table');
    }

    const config = sdpSettings.value as Record<string, string>;
    this.sdpClient = new SdpClient({
      sdpUrl: config.sdpUrl,
      tenantName: config.tenantName,
      apiKey: config.apiKey,
    });

    return this.sdpClient;
  }

  async getOneTokenReservation(payload) {
    const { uuid } = payload;
    this.logger.debug(`Fetching token reservation: ${uuid}`);
    const benfGroupToken = await this.prisma.beneficiaryGroupTokens.findUnique({
      where: {
        uuid: uuid,
      },
    });

    const groupDetails = await this.getOneGroup(benfGroupToken.groupId as UUID);

    // Total beneficiaries in this group
    const totalBeneficiaries = await this.getBeneficiaryCountByGroup(
      benfGroupToken.groupId as string
    );

    // If disbursement is complete, all beneficiaries received tokens; otherwise 0
    const totalSuccess = benfGroupToken.isDisbursed ? totalBeneficiaries : 0;

    return {
      ...benfGroupToken,
      ...groupDetails,
      totalBeneficiaries,
      totalSuccess,
    };
  }

  async getOneTokenReservationByGroupId(groupId: string) {
    this.logger.debug(`Fetching token reservation for group: ${groupId}`);
    const benfGroupToken = await this.prisma.beneficiaryGroupTokens.findFirst({
      where: { groupId: groupId },
      include: {
        beneficiaryGroup: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return benfGroupToken;
  }

  async getBeneficiaryCountByGroup(groupUuid: string): Promise<number> {
    const count = await this.prisma.beneficiaryToGroup.count({
      where: { groupId: groupUuid },
    });
    return count;
  }

  async initDisburseProgressCache(
    groupUuid: string,
    totalBeneficiaries: number
  ): Promise<void> {
    const metaKey = `${DISBURSE_CACHE_KEY_PREFIX}${groupUuid}`;
    const counterKey = `${DISBURSE_CACHE_KEY_PREFIX}count:${groupUuid}`;
    await this.redisService.set(
      metaKey,
      {
        totalBeneficiaries,
        status: 'STARTED',
        lastUpdated: Date.now(),
      },
      DISBURSE_CACHE_TTL
    );
    await this.redisService.set(counterKey, 0, DISBURSE_CACHE_TTL);
  }

  async incrementDisburseProgressCache(
    groupUuid: string,
    count: number = 1
  ): Promise<void> {
    try {
      const metaKey = `${DISBURSE_CACHE_KEY_PREFIX}${groupUuid}`;
      const counterKey = `${DISBURSE_CACHE_KEY_PREFIX}count:${groupUuid}`;

      const cached = await this.redisService.get<{
        totalBeneficiaries: number;
        status: string;
      }>(metaKey);
      if (!cached) return;

      const newCount = await this.redisService.incrby(counterKey, count);
      const clampedCount = Math.min(newCount, cached.totalBeneficiaries);
      const isComplete = clampedCount >= cached.totalBeneficiaries;

      await this.redisService.set(
        metaKey,
        {
          ...cached,
          status: isComplete ? 'DISBURSED' : cached.status,
          lastUpdated: Date.now(),
        },
        DISBURSE_CACHE_TTL
      );
      await this.redisService.expire(counterKey, DISBURSE_CACHE_TTL);
    } catch (error) {
      this.logger.error(
        `Failed to increment disburse cache for ${groupUuid}: ${error.message}`
      );
    }
  }

  async setDisburseProgressStatus(
    groupUuid: string,
    status: string
  ): Promise<void> {
    try {
      const metaKey = `${DISBURSE_CACHE_KEY_PREFIX}${groupUuid}`;
      const cached = await this.redisService.get<{
        totalBeneficiaries: number;
        status: string;
      }>(metaKey);

      await this.redisService.set(
        metaKey,
        {
          totalBeneficiaries: cached?.totalBeneficiaries || 0,
          status,
          lastUpdated: Date.now(),
        },
        DISBURSE_CACHE_TTL
      );
    } catch (error) {
      this.logger.error(
        `Failed to set disburse cache status for ${groupUuid}: ${error.message}`
      );
    }
  }

  async getDisburseProgressCache(groupUuid: string): Promise<{
    totalBeneficiaries: number;
    completedCount: number;
    status: string;
  } | null> {
    const metaKey = `${DISBURSE_CACHE_KEY_PREFIX}${groupUuid}`;
    const counterKey = `${DISBURSE_CACHE_KEY_PREFIX}count:${groupUuid}`;
    const meta = await this.redisService.get<{
      totalBeneficiaries: number;
      status: string;
    }>(metaKey);
    if (!meta) return null;
    const countRaw = await this.redisService.get<number>(counterKey);
    return {
      totalBeneficiaries: meta.totalBeneficiaries,
      completedCount: typeof countRaw === 'number' ? countRaw : 0,
      status: meta.status,
    };
  }

  async getReservationStats(payload) {
    this.logger.debug('Fetching reservation stats');
    const totalReservedTokens = await this.prisma.beneficiary.aggregate({
      _sum: {
        benTokens: true,
      },
    });
    this.logger.debug(
      `Total reserved tokens: ${totalReservedTokens._sum.benTokens}`
    );
    return {
      totalReservedTokens,
    };
  }

  async assignToken() {
    this.logger.log('Starting token assignment process');
    const allBenfs = await this.getCount();
    const batches = this.createBatches(allBenfs, BATCH_SIZE);
    this.logger.debug(
      `Total beneficiaries: ${allBenfs}, batches: ${batches.length}`
    );

    if (batches.length) {
      batches?.forEach((batch) => {
        this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, batch, {
          attempts: 3,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        });
      });
      this.logger.log(`Queued ${batches.length} token assignment batches`);
    } else {
      this.logger.warn('No batches to process for token assignment');
    }
  }

  async updateGroupToken(
    payload: UpdateBeneficiaryGroupTokenDto & { groupUuid: string }
  ) {
    try {
      const { groupUuid, ...data } = payload;
      this.logger.debug(`Updating group token for group: ${groupUuid}`);

      const activeToken = await this.prisma.beneficiaryGroupTokens.findFirst({
        where: { groupId: groupUuid, isDisbursed: false },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeToken)
        throw new RpcException('No active token found for group.');

      const benfGroupToken = await this.prisma.beneficiaryGroupTokens.update({
        where: { uuid: activeToken.uuid },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `Group token with uuid ${benfGroupToken.uuid} updated: ${JSON.stringify(
          data
        )}`
      );

      return benfGroupToken;
    } catch (error) {
      this.logger.error(`Error updating group token: ${error}`);
      throw error;
    }
  }

  private async seedOtpsForBeneficiaries(
    beneficiaries: Array<{
      phone?: string;
      walletAddress?: string;
      [key: string]: any;
    }>
  ) {
    this.logger.debug(`Seeding OTPs for ${beneficiaries.length} beneficiaries`);
    const CHUNK_SIZE = 100;
    const BCRYPT_ROUNDS = 8;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const eligible = beneficiaries.filter((b) => b.phone);
    if (!eligible.length) return;

    const isDev = process.env.NODE_ENV !== 'production';
    let devHash: string | null = null;
    if (isDev) {
      devHash = await bcrypt.hash('1234', BCRYPT_ROUNDS);
    }

    const otpRecords: Array<{
      phoneNumber: string;
      walletAddress?: string;
      otp: string;
      otpHash: string;
      amount: number;
      expiresAt: Date;
    }> = [];

    for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
      this.logger.debug(`Processing OTP seed chunk: ${i} to ${i + CHUNK_SIZE}`);
      const chunk = eligible.slice(i, i + CHUNK_SIZE);
      const chunkRecords = await Promise.all(
        chunk.map(async (b) => {
          const otp = isDev
            ? '1234'
            : Math.floor(1000 + Math.random() * 9000).toString();
          const otpHash = isDev
            ? devHash!
            : await bcrypt.hash(`${otp}`, BCRYPT_ROUNDS);
          return {
            phoneNumber: b.phone!,
            ...(b.walletAddress ? { walletAddress: b.walletAddress } : {}),
            otp,
            otpHash,
            amount: 0,
            expiresAt,
          };
        })
      );
      otpRecords.push(...chunkRecords);
    }

    this.logger.debug(
      `Generated OTP records for ${otpRecords.length} beneficiaries, seeding to database`
    );
    await this.prisma.otp.createMany({
      data: otpRecords,
      skipDuplicates: true,
    });

    this.logger.log(`Seeded OTPs for ${otpRecords.length} beneficiaries`);
  }

  createBatches(total: number, batchSize: number, start = 1) {
    const batches: { size: number; start: number; end: number }[] = [];
    let elementsRemaining = total; // Track remaining elements to batch

    while (elementsRemaining > 0) {
      const end = start + Math.min(batchSize, elementsRemaining) - 1;
      const currentBatchSize = end - start + 1;

      batches.push({
        size: currentBatchSize,
        start: start,
        end: end,
      });

      elementsRemaining -= currentBatchSize; // Subtract batched elements
      start = end + 1; // Move start to the next element
    }

    return batches;
  }

  async updateBeneficiaryRedeem(
    uuid: string,
    payload: Prisma.BeneficiaryRedeemUpdateInput
  ) {
    try {
      this.logger.debug(`Updating beneficiary redeem: ${uuid}`);
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.update({
        where: { uuid },
        data: payload,
      });

      this.logger.log(`Beneficiary redeem updated: ${beneficiaryRedeem.uuid}`);

      // single chokepoint for every caller of this helper (offramp, stellar
      // transfer processors, etc.) — catch payout completion at the real
      // write instead of relying on each call site to remember to check
      if (
        beneficiaryRedeem.payoutId &&
        REDEEM_COMPLETED_STATUSES.includes(payload.status as string)
      ) {
        await this.payoutService.checkAndCompletePayout(
          beneficiaryRedeem.payoutId
        );
      }

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error updating beneficiary redeem: ${error}`);
      throw error;
    }
  }

  async updateBeneficiaryRedeemBulk(
    uuids: string[],
    payload: Prisma.BeneficiaryRedeemUpdateInput
  ) {
    this.logger.debug(`Bulk updating ${uuids.length} beneficiary redeems`);
    const result = await this.prisma.beneficiaryRedeem.updateMany({
      where: { uuid: { in: uuids } },
      data: payload,
    });
    this.logger.log(`Bulk updated ${result.count} beneficiary redeems`);

    if (REDEEM_COMPLETED_STATUSES.includes(payload.status as string)) {
      const updated = await this.prisma.beneficiaryRedeem.findMany({
        where: { uuid: { in: uuids } },
        select: { payoutId: true },
      });
      const payoutIds = [
        ...new Set(updated.map((r) => r.payoutId).filter(Boolean)),
      ];
      await Promise.all(
        payoutIds.map((id) => this.payoutService.checkAndCompletePayout(id))
      );
    }

    return result;
  }

  async createBeneficiaryRedeem(payload: Prisma.BeneficiaryRedeemCreateInput) {
    try {
      this.logger.debug('Creating beneficiary redeem');
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.create({
        data: payload,
      });

      this.logger.log(`Beneficiary redeem created: ${beneficiaryRedeem.uuid}`);

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error creating beneficiary redeem: ${error}`);
      throw error;
    }
  }

  async createBeneficiaryRedeemBulk(
    payload: Prisma.BeneficiaryRedeemCreateManyInput[]
  ) {
    try {
      this.logger.debug(
        `Creating bulk beneficiary redeems, count: ${payload.length}`
      );
      const logs = await this.prisma.beneficiaryRedeem.createMany({
        data: payload,
      });

      this.logger.log(`Created ${logs.count} beneficiary redeem logs`);

      return logs;
    } catch (error) {
      this.logger.error(`Error creating beneficiary redeem bulk: ${error}`);
      throw error;
    }
  }

  async getBeneficiaryRedeem(uuid: string) {
    try {
      this.logger.debug(`Fetching beneficiary redeem: ${uuid}`);
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.findUnique({
        where: { uuid },
        include: {
          payout: true,
          Beneficiary: true,
        },
      });

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error getting beneficiary redeem: ${error}`);
      throw error;
    }
  }

  async getBeneficiaryBankAccount(payload: {
    uuid?: string;
    walletAddress?: string;
  }) {
    return lastValueFrom(
      this.client.send(
        { cmd: JOBS.BENEFICIARY.GET_BENEFICIARY_BANK_ACCOUNT },
        payload
      )
    );
  }

  /**
   * Get failed beneficiary redeem by payout UUID
   * This is used to get failed beneficiary redeem by payout UUID grouped by status
   *
   * @param payoutUUID - The UUID of the payout
   * @returns { status: 'FIAT_TRANSACTION_FAILED' | 'TOKEN_TRANSACTION_FAILED', count: number, beneficiaryRedeems: Prisma.BeneficiaryRedeemGetPayload<{ include: { Beneficiary: true; } }>[] }[] - The failed beneficiary redeem
   */
  async getFailedBeneficiaryRedeemByPayoutUUID(payoutUUID: string): Promise<
    {
      status: 'FIAT_TRANSACTION_FAILED' | 'TOKEN_TRANSACTION_FAILED';
      count: number;
      beneficiaryRedeems: Prisma.BeneficiaryRedeemGetPayload<{
        include: {
          Beneficiary: true;
        };
      }>[];
    }[]
  > {
    this.logger.debug(
      `Fetching failed beneficiary redeems for payout: ${payoutUUID}`
    );
    return this.prisma.$queryRaw`
      SELECT
        status,
        COUNT(*)::int AS count,
        json_agg(tbl_beneficiary_redeem) AS "beneficiaryRedeems"
      FROM public.tbl_beneficiary_redeem
        WHERE "payoutId" = ${payoutUUID}
        AND status IN ('FIAT_TRANSACTION_FAILED', 'TOKEN_TRANSACTION_FAILED')
      GROUP BY status;
      `;
  }

  /**
   * Get beneficiary redeem information by beneficiary UUID
   * This is used to get all beneficiary redeem details including wallet, token amount, transaction type, status, and txHash
   *
   * @param beneficiaryUUID - The UUID of the beneficiary
   * @returns { beneficiaryWallet: string; tokenAmount: number; transactionType: string; status: string; txHash: string | null }[] - Array of beneficiary redeem information
   */
  async getBeneficiaryRedeemInfo(beneficiaryUUID: string): Promise<
    {
      uuid: string;
      beneficiaryWallet: string;
      tokenAmount: number;
      transactionType: string;
      status: string;
      txHash: string | null;
      createdAt: Date | null;
      updatedAt: Date | null;
      payoutType?: string;
      mode?: string;
      vendorName?: string;
      extras?: any;
    }[]
  > {
    this.logger.log(
      `Getting beneficiary redeem information for beneficiary UUID: ${beneficiaryUUID}`
    );

    if (!beneficiaryUUID) {
      throw new RpcException('Beneficiary UUID is required');
    }

    // First get the beneficiary to get their wallet address
    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { uuid: beneficiaryUUID },
      select: { walletAddress: true },
    });

    if (!beneficiary) {
      this.logger.warn(`Beneficiary not found: ${beneficiaryUUID}`);
      throw new RpcException('Beneficiary not found');
    }

    try {
      // Get all beneficiary redeem records for this beneficiary
      const beneficiaryRedeems = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          beneficiaryWalletAddress: beneficiary.walletAddress,
          isCompleted: true,
          transactionType: {
            in: ['FIAT_TRANSFER', 'VENDOR_REIMBURSEMENT'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          uuid: true,
          beneficiaryWalletAddress: true,
          amount: true,
          transactionType: true,
          status: true,
          txHash: true,
          payout: {
            select: {
              type: true,
              mode: true,
              extras: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          Vendor: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!beneficiaryRedeems || beneficiaryRedeems.length === 0) {
        this.logger.debug(
          `No completed redeems found for beneficiary: ${beneficiaryUUID}`
        );
        return [];
      }

      this.logger.debug(
        `Found ${beneficiaryRedeems.length} redeems for beneficiary: ${beneficiaryUUID}`
      );

      return beneficiaryRedeems.map((redeem) => ({
        uuid: redeem.uuid,
        beneficiaryWallet: redeem.beneficiaryWalletAddress,
        tokenAmount: redeem.amount,
        transactionType: String(redeem.transactionType),
        status: String(redeem.status),
        txHash: redeem.txHash,
        createdAt: redeem.createdAt,
        updatedAt: redeem.updatedAt,
        payoutType: redeem?.payout?.type,
        mode: redeem?.payout?.mode,
        vendorName: redeem?.Vendor?.name,
        extras: redeem?.payout?.extras,
      }));
    } catch (error) {
      this.logger.error(`Error getting beneficiary redeem info: ${error}`);
      throw error;
    }
  }

  async getBeneficiaryRedeemInfoInkind(beneficiaryUUID: string) {
    this.logger.log(
      `Getting beneficiary inkind redeem information for beneficiary UUID: ${beneficiaryUUID}`
    );

    if (!beneficiaryUUID) {
      throw new RpcException('Beneficiary UUID is required');
    }

    // First get the beneficiary to get their wallet address
    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { uuid: beneficiaryUUID },
      select: { walletAddress: true },
    });

    if (!beneficiary) {
      this.logger.warn(`Beneficiary not found: ${beneficiaryUUID}`);
      throw new RpcException('Beneficiary not found');
    }

    try {
      //fetch inkind redeems of the beneficiary
      const redeems = await this.prisma.beneficiaryInkindRedemption.findMany({
        where: {
          beneficiaryWallet: beneficiary.walletAddress,
          status: 'COMPLETED',
        },
        orderBy: {
          redeemedAt: 'desc',
        },
        select: {
          uuid: true,
          beneficiaryWallet: true,
          status: true,
          quantity: true,
          groupInkind: {
            select: {
              inkind: {
                select: {
                  name: true,
                  type: true,
                },
              },
            },
          },
          txHash: true,
          redeemedAt: true,
          Vendor: {
            select: {
              name: true,
            },
          },
        },
      });

      this.logger.debug(
        `Found ${redeems.length} inkind redeems for beneficiary: ${beneficiaryUUID}`
      );
      return redeems;
    } catch (error) {
      this.logger.error(
        `Error getting beneficiary inkind redeem info: ${error}`
      );
      throw error;
    }
  }

  async benTokensUpdate(payload) {
    const { groupUuid } = payload;
    this.logger.log(`Updating beneficiary tokens for group: ${groupUuid}`);
    try {
      const beneficiaryGroup = await this.prisma.beneficiaryGroups.findUnique({
        where: {
          uuid: groupUuid,
        },
        select: {
          tokensReserved: true,
          beneficiaries: true,
        },
      });

      if (!beneficiaryGroup) {
        this.logger.warn(`Beneficiary group with UUID ${groupUuid} not found.`);
        return;
      }

      const activeToken = beneficiaryGroup.tokensReserved.find(
        (t) => t.isDisbursed === false
      );

      if (!activeToken) {
        this.logger.warn(
          `No active tokens reserved for group with UUID ${groupUuid}.`
        );
        return;
      }

      if (
        !beneficiaryGroup.beneficiaries ||
        beneficiaryGroup.beneficiaries.length === 0
      ) {
        this.logger.warn(
          `No beneficiaries found in group with UUID ${groupUuid}.`
        );
        return;
      }

      const benfIds = beneficiaryGroup.beneficiaries.map(
        (benf) => benf.beneficiaryId
      );

      const tokensPerBeneficiary = Math.floor(
        activeToken.numberOfTokens / beneficiaryGroup.beneficiaries.length
      );

      this.logger.debug(
        `Distributing ${tokensPerBeneficiary} tokens each to ${benfIds.length} beneficiaries in group ${groupUuid}`
      );

      await this.prisma.beneficiary.updateMany({
        where: {
          uuid: {
            in: benfIds,
          },
        },
        data: {
          benTokens: {
            increment: tokensPerBeneficiary,
          },
        },
      });

      this.logger.log(
        `Updated ${benfIds.length} beneficiaries with ${tokensPerBeneficiary} tokens each for group ${groupUuid}.`
      );

      return;
    } catch (error) {
      this.logger.error(`Error updating beneficiary tokens: ${error}`);
      throw new RpcException(
        `Failed to update beneficiary tokens for group ${groupUuid}: ${error.message}`
      );
    }
  }

  async getBalance() {
    this.logger.debug('Fetching beneficiary token balances');
    try {
      // Fetch all active beneficiaries with wallet addresses
      const redeems = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          payoutId: { not: null },
        },
        select: {
          beneficiaryWalletAddress: true,
        },
        distinct: ['beneficiaryWalletAddress'],
      });

      const wallets = redeems.map((r) => r.beneficiaryWalletAddress);
      this.logger.debug(
        `Fetching balances for ${wallets.length} unique wallets`
      );

      // Get token contract address and Alchemy API URL
      const cashTokenSetting = await this.settingsService.getPublic(
        'CASH_TOKEN_CONTRACT'
      );
      const tokenAddress = cashTokenSetting.value;

      const alchemyApiUrl = (
        await this.settingsService.getPublic('CHAIN_SETTINGS')
      ).value as any;

      // Initialize total balance
      let totalBalance = 0n;
      const metadataResponse = await axios.post(alchemyApiUrl.rpcUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [tokenAddress],
      });
      const decimals = metadataResponse.data?.result?.decimals ?? 18;
      this.logger.debug(`Token decimals: ${decimals}`);

      // Fetch balances for each wallet
      await Promise.all(
        wallets.map(async (wallet) => {
          const response = await axios.post(alchemyApiUrl.rpcUrl, {
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenBalances',
            params: [wallet, [tokenAddress]],
          });
          const tokenBalances = response.data?.result?.tokenBalances || [];
          for (const balance of tokenBalances) {
            if (balance.tokenBalance) {
              const rawBalance = BigInt(balance.tokenBalance);
              totalBalance += rawBalance;
            }
          }
        })
      );
      // Get the latest updatedAt from completed redeems
      const latestCompletedRedeem =
        await this.prisma.beneficiaryRedeem.findFirst({
          where: {
            payoutId: { not: null }, // Redeems with payouts
            isCompleted: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: {
            updatedAt: true,
          },
        });
      const formattedData = Number(totalBalance);
      const formatted = ethers.formatUnits(formattedData.toString(), decimals);
      this.logger.log(
        `Total balance across ${wallets.length} wallets: ${formatted}`
      );
      return {
        totalBalance: formatted,
        latestCompletedRedeemAt: latestCompletedRedeem?.updatedAt || null,
      };
    } catch (error) {
      const errData =
        error instanceof Error
          ? (error as any).response?.data || error.message
          : String(error);
      this.logger.error(`Error fetching balances: ${errData}`);
      throw new Error('Failed to fetch balances');
    }
  }

  async createBeneficiaryWithDbTransaction(dto: {
    action: string;
    dbTxId: string;
    payload: any;
  }) {
    this.logger.log(
      `Creating beneficiary with database transaction - Action: ${dto.action}`
    );

    const { action, dbTxId, payload } = dto;
    const aaDbTxId = `aa_tx_${dbTxId}`;

    const actionHandlers: Record<string, () => Promise<string>> = {
      BEGIN: async () => {
        await this.prisma.$executeRawUnsafe('BEGIN;');
        return 'Transaction started';
      },
      CREATE: async () => {
        await this.prisma.beneficiary.create({ data: payload });
        return 'Beneficiary created';
      },
      PREPARE: async () => {
        await this.prisma.$executeRawUnsafe(
          `PREPARE TRANSACTION '${aaDbTxId}';`
        );
        return 'Transaction prepared';
      },
      COMMIT: async () => {
        await this.prisma.$executeRawUnsafe(`COMMIT PREPARED '${aaDbTxId}';`);
        return 'Transaction committed';
      },
      ROLLBACK: async () => {
        try {
          await this.prisma.$executeRawUnsafe(
            `ROLLBACK PREPARED '${aaDbTxId}';`
          );
        } catch {
          await this.prisma.$executeRawUnsafe('ROLLBACK;');
        }
        return 'Transaction rolled back';
      },
    };

    const handler = actionHandlers[action];
    if (!handler) throw new Error('Invalid action');

    try {
      const message = await handler();
      this.logger.log(message);
      return { isSuccess: true, message };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Database transaction failed [${action}] txId=${aaDbTxId}: ${errMsg}`
      );
      throw new Error(`Database transaction failed: ${errMsg}`);
    }
  }

  async syncBeneficiaryGroupData(dto: {
    groupUuid: string;
    isLastBatch?: boolean;
    beneficiariesData: {
      uuid: string;
      walletAddress: string;
      gender?: string;
      isVerified?: boolean;
      extras?: any;
      phone?: string;
    }[];
  }) {
    const { groupUuid, beneficiariesData, isLastBatch } = dto;

    const group = await this.prisma.beneficiaryGroups.findUnique({
      where: { uuid: groupUuid },
    });
    if (!group) throw new Error(`Beneficiary group not found: ${groupUuid}`);

    const BCRYPT_ROUNDS = 8;
    const isDev = process.env.NODE_ENV !== 'production';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let devHash: string | null = null;
    if (isDev) {
      devHash = await bcrypt.hash('1234', BCRYPT_ROUNDS);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const benf of beneficiariesData) {
        await tx.beneficiary.upsert({
          where: { uuid: benf.uuid },
          update: {
            walletAddress: benf.walletAddress,
            gender: (benf.gender as any) || 'UNKNOWN',
            isVerified: benf.isVerified ?? false,
            extras: benf.extras,
            phone: benf.phone || null,
          },
          create: {
            uuid: benf.uuid,
            walletAddress: benf.walletAddress,
            gender: (benf.gender as any) || 'UNKNOWN',
            isVerified: benf.isVerified ?? false,
            extras: benf.extras,
            phone: benf.phone || null,
          },
        });

        await tx.beneficiaryToGroup.upsert({
          where: {
            beneficiaryId_groupId: {
              beneficiaryId: benf.uuid,
              groupId: groupUuid,
            },
          },
          update: {},
          create: { beneficiaryId: benf.uuid, groupId: groupUuid },
        });

        if (benf.phone && benf.walletAddress) {
          const otp = isDev
            ? '1234'
            : Math.floor(1000 + Math.random() * 9000).toString();
          const otpHash = isDev
            ? devHash!
            : await bcrypt.hash(otp, BCRYPT_ROUNDS);

          await tx.otp.upsert({
            where: { walletAddress: benf.walletAddress },
            update: {
              phoneNumber: benf.phone,
              otp,
              otpHash,
              expiresAt,
            },
            create: {
              phoneNumber: benf.phone,
              walletAddress: benf.walletAddress,
              otp,
              otpHash,
              amount: 0,
              expiresAt,
            },
          });
        }
      }
    });

    this.logger.log(`Beneficiary group data synced successfully: ${groupUuid}`);

    //THIS IS TAKING TOO MUCH RESOURCES, SO COMMENTING OUT FOR NOW. WILL REVISIT LATER

    // if (isLastBatch) {
    //   await this.initiateQrPdf(groupUuid);
    //   this.logger.log(`Last batch processed, PDF generation triggered for group: ${groupUuid}`);
    // }

    return { message: 'Sync process completed successfully' };
  }
}
