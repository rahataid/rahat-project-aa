import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { async, lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import {
  AddTokenToGroup,
  AssignBenfGroupToProject,
  CreateBeneficiaryDto,
} from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StellarService } from '../stellar/stellar.service';
import { UpdateBeneficiaryGroupTokenDto } from './dto/update-benf-group-token.dto';

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
    @InjectQueue(BQUEUE.STELLAR) private readonly stellarQueue: Queue,
    private eventEmitter: EventEmitter2,
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

    const keys = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.wallet.getSecretByWallet' },
        { walletAddress: dto.walletAddress, chain: 'STELLAR' }
      )
    );

    await this.stellarQueue.add(
      JOBS.STELLAR.FAUCET_TRUSTLINE,
      { walletAddress: keys.address, secretKey: keys.privateKey },
      {
        attempts: 3,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }
    );

    await this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);

    return rdata;
  }

  async createMany(dto) {
    const rdata = await this.rsprisma.beneficiary.createMany({ data: dto });

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

  async getAllGroups(dto) {
    const { page, perPage, sort, order, tokenAssigned, search } = dto;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const benfGroups = await paginate(
      this.prisma.beneficiaryGroups,
      {
        where: {
          ...(tokenAssigned === true
            ? { tokensReserved: { isNot: null } } // only assigned
            : tokenAssigned === false
            ? { tokensReserved: null } // only unassigned
            : {}), // both
          ...(search && {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          }),

          deletedAt: null,
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

    data.groupedBeneficiaries = data.groupedBeneficiaries.map((benf) => {
      let token = null;

      if (benfGroup.tokensReserved) {
        token = benfGroup.tokensReserved.numberOfTokens;
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
      },
    });

    const groupedBeneficiaries = await this.prisma.beneficiaryToGroup.createMany({
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

    if (beneficiaryGroupId) {
      const isAlreadyReserved =
        await this.prisma.beneficiaryGroupTokens.findUnique({
          where: { groupId: beneficiaryGroupId },
        });

      if (isAlreadyReserved) {
        throw new RpcException('Token already reserved.');
      }
    }

    return this.prisma.$transaction(async () => {
      const group = await this.getOneGroup(beneficiaryGroupId as UUID);

      if (!group || !group?.groupedBeneficiaries) {
        throw new RpcException(
          'No beneficiaries found in the specified group.'
        );
      }

      // for (const member of group?.groupedBeneficiaries) {
      //   const benf = await this.prisma.beneficiary.findUnique({
      //     where: {
      //       uuid: member?.beneficiaryId,
      //     },
      //   });
      //   if (benf.benTokens > 0)
      //     throw new RpcException('Token already assigned to beneficiary.');
      // }

      const benfIds = group?.groupedBeneficiaries?.map(
        (d: any) => d?.beneficiaryId
      );

      await this.prisma.beneficiary.updateMany({
        where: {
          uuid: {
            in: benfIds,
          },
        },
        data: {
          benTokens: {
            increment: numberOfTokens,
          },
        },
      });

      await this.prisma.beneficiaryGroupTokens.create({
        data: {
          title,
          groupId: beneficiaryGroupId,
          numberOfTokens: totalTokensReserved,
          createdBy: user?.name,
        },
      });

      this.eventEmitter.emit(EVENTS.TOKEN_RESERVED);

      return group;
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

  async updateGroupToken(payload: UpdateBeneficiaryGroupTokenDto & { groupUuid: string }) {
    try {
      const { groupUuid, ...data } = payload;

      const benfGroupToken = await this.prisma.beneficiaryGroupTokens.update({
        where: { groupId: groupUuid },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Group token with uuid ${benfGroupToken.uuid} updated: ${JSON.stringify(data)}`);

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
}
