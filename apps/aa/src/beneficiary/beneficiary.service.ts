import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { lastValueFrom } from 'rxjs';
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
import { GroupPurpose, Prisma } from '@prisma/client';

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
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async getAllBenfs() {
    return this.prisma.beneficiary.findMany();
  }

  async getCount() {
    return this.prisma.beneficiary.count({
      where: {
        deletedAt: null,
      },
    });
  }

  async getBenfBetweenIds(startId: number, endId: number) {
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
    const { isVerified, ...rest } = dto;
    const rdata = await this.rsprisma.beneficiary.create({
      data: rest,
    });
    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);
    return rdata;
  }

  async createBulk(dto: CreateBulkBeneficiaryDto) {
    const { beneficiaries } = dto;

    // Process each beneficiary to remove isVerified field
    const processedBeneficiaries = beneficiaries.map(
      ({ isVerified, ...rest }) => rest
    );

    const rdata = await this.rsprisma.beneficiary.createMany({
      data: processedBeneficiaries,
      skipDuplicates: true,
    });

    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);
    return rdata;
  }

  async createMany(dto) {
    const rdata = await this.rsprisma.beneficiary.createMany({
      data: dto,
      skipDuplicates: true,
    });

    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);

    return rdata;
  }

  async findAll(dto) {
    const { page, perPage, sort, order } = dto;

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
    const { page, perPage, sort, order, tokenAssigned, search, hasPayout } =
      dto;

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
          beneficiaries: true,
          tokensReserved: true,
        },
        orderBy,
      },
      {
        page,
        perPage,
      }
    );

    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        benfGroups
      )
    );

    res.data = res.data.map((group) => {
      let updatedGroup = group;
      benfGroups.data.forEach((benfGroup: any) => {
        if (group.uuid === benfGroup.uuid) {
          updatedGroup = {
            ...group,
            tokensReserved: benfGroup.tokensReserved,
          };
        }
      });
      return updatedGroup;
    });

    return res;
  }

  async getAllGroupsByUuids(payload: getGroupByUuidDto) {
    this.logger.log('Fetching all beneficiary group by group uuids');
    const { uuids, selectField } = payload;
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

      return groups;
    } catch (err) {
      throw new RpcException(
        `Error while fetching beneficiary groups by uuids. ${err.message}`
      );
    }
  }

  async findByUUID(uuid: UUID) {
    return await this.rsprisma.beneficiary.findUnique({ where: { uuid } });
  }

  async findOne(payload) {
    const { uuid, data } = payload;
    const projectBendata = await this.rsprisma.beneficiary.findUnique({
      where: { uuid },
    });
    if (data) return { ...data, ...projectBendata };
    return projectBendata;
  }

  async findOneBeneficiary(payload) {
    const { uuid, data } = payload;
    const projectBendata = await this.rsprisma.beneficiary.findUnique({
      where: { uuid },
    });
    return this.client.send(
      { cmd: 'rahat.jobs.beneficiary.find_one_beneficiary' },
      projectBendata
    );
  }

  async findOneBeneficiaryByWalletAddress(walletAddress: string) {
    return this.rsprisma.beneficiary.findUnique({
      where: { walletAddress },
    });
  }

  async update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    const rdata = await this.rsprisma.beneficiary.update({
      where: { id: id },
      data: { ...updateBeneficiaryDto },
    });

    this.eventEmitter.emit(EVENTS.BENEFICIARY_UPDATED);

    return rdata;
  }

  async remove(payload: any) {
    const uuid = payload.uuid;
    const findUuid = await this.rsprisma.beneficiary.findUnique({
      where: {
        uuid,
      },
    });

    if (!findUuid) return 'OK';

    const rdata = await this.rsprisma.beneficiary.update({
      where: {
        uuid,
      },
      data: {
        deletedAt: new Date(),
      },
    });

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

    const totalBenf = data?.groupedBeneficiaries?.length ?? 0;

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

    return {
      group,
      groupedBeneficiaries,
    };
  }

  async reserveTokenToGroup(payload: AddTokenToGroup) {
    const {
      beneficiaryGroupId,
      numberOfTokens,
      title,
      totalTokensReserved,
      user,
    } = payload;

    const isAlreadyReserved =
      await this.prisma.beneficiaryGroupTokens.findUnique({
        where: { groupId: beneficiaryGroupId },
      });

    if (isAlreadyReserved) {
      throw new RpcException('Token already reserved.');
    }

    const benfGroup = await this.prisma.beneficiaryGroups.findUnique({
      where: {
        uuid: beneficiaryGroupId,
      },
    });

    if (!benfGroup) {
      throw new RpcException('Beneficiary group not found.');
    }

    if (
      benfGroup.groupPurpose !== GroupPurpose.BANK_TRANSFER &&
      benfGroup.groupPurpose !== GroupPurpose.MOBILE_MONEY
    ) {
      throw new RpcException(
        `Invalid group purpose ${benfGroup.groupPurpose}. Only BANK_TRANSFER and MOBILE_MONEY are allowed.`
      );
    }

    return this.prisma.$transaction(async () => {
      const group = await this.getOneGroup(beneficiaryGroupId as UUID);

      if (!group || !group?.groupedBeneficiaries) {
        throw new RpcException(
          'No beneficiaries found in the specified group.'
        );
      }

      const benfIdsAndWalletAddress = group?.groupedBeneficiaries?.map(
        (d: any) => {
          return {
            uuid: d?.Beneficiary?.uuid,
            walletAddress: d?.Beneficiary?.walletAddress,
          };
        }
      );

      const tokenAssignedBenfWallet = [];

      for (const benf of benfIdsAndWalletAddress) {
        const tokenAssignedGroup = await this.prisma.beneficiaryGroups.findMany(
          {
            where: {
              tokensReserved: {
                isNot: null,
              },
              beneficiaries: {
                some: {
                  beneficiaryId: { equals: benf.uuid },
                },
              },
            },
          }
        );
        if (tokenAssignedGroup.length > 0) {
          tokenAssignedBenfWallet.push(benf.walletAddress);
        }
      }

      if (tokenAssignedBenfWallet.length > 0) {
        // Handle the case where tokens are already assigned to some beneficiaries
        return {
          status: 'error',
          message:
            'Tokens have already been assigned to the following beneficiaries wallet addresses',
          wallets: tokenAssignedBenfWallet,
          groupName: benfGroup.name,
        };
      }

      // await this.prisma.beneficiary.updateMany({
      //   where: {
      //     uuid: {
      //       in: benfIds,
      //     },
      //   },
      //   data: {
      //     benTokens: {
      //       increment: numberOfTokens,
      //     },
      //   },
      // });
      // when disbursement is successful, we will update the benTokens not now

      await this.prisma.beneficiaryGroupTokens.create({
        data: {
          title,
          groupId: beneficiaryGroupId,
          numberOfTokens: totalTokensReserved,
          createdBy: user?.name,
        },
      });

      this.eventEmitter.emit(EVENTS.TOKEN_RESERVED);

      return {
        status: 'success',
        message: `Successfully reserved ${totalTokensReserved} tokens for group ${benfGroup.name}.`,
        group,
      };
    });
  }

  async getAllTokenReservations(dto) {
    const { page, perPage, sort, order } = dto;

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
    const benfGroupToken = await this.prisma.beneficiaryGroupTokens.findUnique({
      where: { groupId: groupId },
      include: {
        beneficiaryGroup: true,
      },
    });

    return benfGroupToken;
  }

  async getReservationStats(payload) {
    const totalReservedTokens = await this.prisma.beneficiary.aggregate({
      _sum: {
        benTokens: true,
      },
    });
    return {
      totalReservedTokens,
    };
  }

  async assignToken() {
    const allBenfs = await this.getCount();
    const batches = this.createBatches(allBenfs, BATCH_SIZE);

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
    }
  }

  async updateGroupToken(
    payload: UpdateBeneficiaryGroupTokenDto & { groupUuid: string }
  ) {
    try {
      const { groupUuid, ...data } = payload;

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
    return this.prisma.beneficiaryRedeem.updateMany({
      where: { uuid: { in: uuids } },
      data: payload,
    });
  }

  async createBeneficiaryRedeem(payload: Prisma.BeneficiaryRedeemCreateInput) {
    try {
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
      createdAt: Date;
      updatedAt: Date;
      payoutType?: string;
      mode?: string;
      vendorName?: string;
      extras?: any;
    }[]
  > {
    try {
      // Validate beneficiaryUUID
      if (!beneficiaryUUID) {
        throw new RpcException('Beneficiary UUID is required');
      }

      // First get the beneficiary to get their wallet address
      const beneficiary = await this.prisma.beneficiary.findUnique({
        where: { uuid: beneficiaryUUID },
        select: { walletAddress: true },
      });

      if (!beneficiary) {
        throw new RpcException('Beneficiary not found');
      }

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
        throw new RpcException('No redeem records found for this beneficiary');
      }

      return beneficiaryRedeems.map((redeem) => ({
        uuid: redeem.uuid,
        beneficiaryWallet: redeem.beneficiaryWalletAddress,
        tokenAmount: redeem.amount,
        transactionType: redeem.transactionType,
        status: redeem.status,
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
}
