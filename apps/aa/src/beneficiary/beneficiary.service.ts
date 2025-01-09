import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { UUID } from 'crypto';
import { lastValueFrom } from 'rxjs';
import { EVENTS } from '../constants';
import {
  AddTokenToGroup,
  AssignBenfGroupToProject,
  CreateBeneficiaryDto,
} from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

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
  constructor(
    protected prisma: PrismaService,
    @Inject('RAHAT_CLIENT') private readonly client: ClientProxy,
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
    const rdata = await this.rsprisma.beneficiary.create({
      data: dto,
    });

    this.eventEmitter.emit(EVENTS.BENEFICIARY_CREATED);

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
    const { page, perPage, sort, order } = dto;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    const benfGroups = await paginate(
      this.prisma.beneficiaryGroups,
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
      { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
      benfGroups
    );
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
    });
    if (!benfGroup) throw new RpcException('Beneficiary group not found.');

    return lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
        benfGroup.uuid
      )
    );
  }

  async addGroupToProject(payload: AssignBenfGroupToProject) {
    const { beneficiaryGroupData } = payload;
    return this.prisma.beneficiaryGroups.create({
      data: {
        uuid: beneficiaryGroupData.uuid,
        name: beneficiaryGroupData.name,
      },
    });
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
}
