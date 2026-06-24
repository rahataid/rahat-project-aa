import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
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
import { createContractInstance } from '../utils/web3';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });
const BATCH_SIZE = 50;
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
  constructor(
    protected prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => PayoutsService))
    private readonly payoutService: PayoutsService,
    private readonly qrPdfService: QrPdfService
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
            ? { tokensReserved: { isNot: null } }
            : tokenAssigned === false
            ? {
                tokensReserved: null,
                groupPurpose: { not: GroupPurpose.COMMUNICATION },
              }
            : {}),
        },
        {
          ...(hasPayout === true
            ? {
                tokensReserved: {
                  payoutId: { not: null },
                },
              }
            : hasPayout === false
            ? {
                tokensReserved: {
                  payoutId: null,
                  isDisbursed: true,
                },
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

    const benfGroups = await paginate(
      this.prisma.beneficiaryGroups,
      {
        where: {
          ...where,
        },
        include: {
          _count: {
            select: {
              beneficiaries: true,
            },
          },
          tokensReserved: true,
        },
        orderBy,
      },
      {
        page,
        perPage,
      }
    );

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
    this.logger.debug(`Fetching beneficiary group: ${uuid}`);
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

    this.logger.debug(`Group found: ${uuid}, fetching project data`);
    const data = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
        benfGroup.uuid
      )
    );

    const totalBenf = data?.groupedBeneficiaries?.length ?? 0;
    this.logger.debug(`Group ${uuid} has ${totalBenf} beneficiaries`);

    data.benfGroupTokensStatus = benfGroup?.tokensReserved?.status;

    data.groupedBeneficiaries = data.groupedBeneficiaries.map((benf) => {
      let token = null;

      if (benfGroup.tokensReserved) {
        token = Math.floor(benfGroup.tokensReserved.numberOfTokens / totalBenf);
      }

      return {
        ...benf,
        tokensReserved: token,
      };
    });

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

    return {
      group,
      groupedBeneficiaries,
    };
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

    for (const benf of benfIdsAndWalletAddress) {
      const tokenAssignedGroups = await this.prisma.beneficiaryGroups.findMany({
        where: {
          tokensReserved: { isNot: null },
          beneficiaries: {
            some: { beneficiaryId: { equals: benf.uuid } },
          },
        },
      });

      if (tokenAssignedGroups.length > 0) {
        tokenAssignedBenfWallet.push(benf.walletAddress);
      }
    }

    if (tokenAssignedBenfWallet.length > 0) {
      this.logger.warn(
        `Token already assigned to ${tokenAssignedBenfWallet.length} beneficiaries in group: ${groupId}`
      );
      return {
        isAssignable: false,
        status: 'error',
        message:
          'Tokens have already been assigned to the following beneficiaries wallet addresses',
        wallets: tokenAssignedBenfWallet,
        groupName: group.name,
      };
    }

    this.logger.debug(`No token conflicts found for group: ${groupId}`);
    return {
      isAssignable: true,
      status: 'success',
      message: 'No tokens have been assigned yet. Tokens can be assigned.',
      groupName: group.name,
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
      await this.prisma.beneficiaryGroupTokens.findUnique({
        where: { groupId: beneficiaryGroupId },
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

    const isVendorWithGeneral =
      params?.type === PayoutType.VENDOR &&
      benfGroup.groupPurpose === GroupPurpose.GENERAL;

    const isNoPayoutWithGeneral =
      !isPayoutIntegrated && benfGroup.groupPurpose === GroupPurpose.GENERAL;

    if (
      !isVendorWithGeneral &&
      !isNoPayoutWithGeneral &&
      benfGroup.groupPurpose !== GroupPurpose.BANK_TRANSFER &&
      benfGroup.groupPurpose !== GroupPurpose.MOBILE_MONEY
    ) {
      this.logger.warn(
        `Invalid group purpose ${benfGroup.groupPurpose} for group: ${beneficiaryGroupId}`
      );
      throw new RpcException(
        `Invalid group purpose ${benfGroup.groupPurpose}. Only BANK_TRANSFER, MOBILE_MONEY, and GENERAL are allowed.`
      );
    }

    const tokenAssignmentCheck = await this.checkIsTokenAlreadyAssigned(
      beneficiaryGroupId as UUID
    );

    if (!tokenAssignmentCheck.isAssignable) {
      return tokenAssignmentCheck;
    }

    // Tx definies a single transaction with a number of operations that either all succeed or all fail together
    // Which is crucial for maintaining data integrity when reserving tokens and creating payouts.
    return this.prisma.$transaction(async (tx) => {
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
          },
          tx as any
        );
      }

      this.eventEmitter.emit(EVENTS.TOKEN_RESERVED);

      return {
        status: 'success',
        message: `Successfully reserved ${totalTokensReserved} tokens for group ${benfGroup.name}.`,
      };
    });
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

    for (const d of data) {
      const group = await this.getOneGroup(d['groupId'] as UUID);
      formattedData.push({
        ...d,
        group,
      });
    }

    return {
      data: formattedData,
      meta,
    };
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

    return {
      ...benfGroupToken,
      ...groupDetails,
    };
  }

  async getOneTokenReservationByGroupId(groupId: string) {
    this.logger.debug(`Fetching token reservation for group: ${groupId}`);
    const benfGroupToken = await this.prisma.beneficiaryGroupTokens.findUnique({
      where: { groupId: groupId },
      include: {
        beneficiaryGroup: true,
      },
    });

    return benfGroupToken;
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

      const benfGroupToken = await this.prisma.beneficiaryGroupTokens.update({
        where: { groupId: groupUuid },
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

      if (!beneficiaryGroup.tokensReserved) {
        this.logger.warn(
          `No tokens reserved for group with UUID ${groupUuid}.`
        );
        return;
      }

      if (
        !beneficiaryGroup.beneficiaries &&
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
        beneficiaryGroup.tokensReserved.numberOfTokens /
          beneficiaryGroup.beneficiaries.length
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
    beneficiariesData: {
      uuid: string;
      walletAddress: string;
      gender?: string;
      isVerified?: boolean;
      extras?: any;
      phone?: string;
    }[];
  }) {
    const { groupUuid, beneficiariesData } = dto;

    const group = await this.prisma.beneficiaryGroups.findUnique({
      where: { uuid: groupUuid },
    });
    if (!group) throw new Error(`Beneficiary group not found: ${groupUuid}`);

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
      }
    });

    this.logger.log(`Beneficiary group data synced successfully: ${groupUuid}`);
    await this.initiateQrPdf(groupUuid);
    return { message: 'Sync process completed successfully' };
  }
}
