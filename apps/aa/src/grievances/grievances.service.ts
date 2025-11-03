import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { BQUEUE } from '@rahataid/sdk';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CORE_MODULE } from '../constants';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceStatusDto } from './dto/update-grievance-status.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import { GrievanceStatsResponse } from './dto/grievance-stats.dto';
import {
  formatCoreCreateGrievancePayload,
  formatCoreUpdateGrievancePayload,
} from './utils/grievances.service.utils';
import { ListGrievanceDto } from './dto/list-grievance.dto';
import { Prisma } from '@prisma/client';
import { handleMicroserviceCall } from '../utils/handleMicroServiceCall';

const paginate: PaginatorTypes.PaginateFunction = paginator({
  perPage: 20,
});

@Injectable()
export class GrievancesService {
  private rsprisma;

  constructor(
    protected prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.RAHAT) private readonly contractQueue: Queue,
    private eventEmitter: EventEmitter2
  ) {
    this.rsprisma = prisma.rsclient;
  }

  async create(data: CreateGrievanceDto) {
    return this.prisma.$transaction(async (tx) => {
      // Convert CreatedByUserDto to plain object for Prisma
      const { createdByUser, ...restData } = data;
      const prismaData = {
        ...restData,
        createdByUser: createdByUser
          ? {
              id: createdByUser.id,
              name: createdByUser.name,
              email: createdByUser.email,
            }
          : null,
      };

      const grievance = await tx.grievance.create({ data: prismaData });
      console.log(
        'Grievance created successfully in project, now payload for core:',
        grievance
      );

      return await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.created' },
          formatCoreCreateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance created successfully core', grievance);
          return res;
        },
        onError: async (error) => {
          //TODO: remove grievance from db
          console.log('ERRORssssss', error);
          await tx.grievance.delete({ where: { id: grievance.id } });
          console.error('Error creating grievance:', error);
          throw new RpcException(error);
        },
      });
    });
  }

  async listAll(payload: ListGrievanceDto) {
    const { page, perPage } = payload;

    const where: Prisma.GrievanceWhereInput = {
      deletedAt: null,
    };

    if (payload.title) {
      where.title = {
        contains: payload.title,
        mode: 'insensitive',
      };
    }

    if (payload.status) {
      where.status = payload.status;
    }

    if (payload.type) {
      where.type = payload.type;
    }

    if (payload.priority) {
      where.priority = payload.priority;
    }

    const orderBy: Prisma.GrievanceOrderByWithRelationInput = {
      [payload.sort]: payload.order,
    };

    return paginate(
      this.prisma.grievance,
      {
        where,
        orderBy,
      },
      {
        page,
        perPage,
      }
    );
  }

  async updateStatus(dto: UpdateGrievanceStatusDto) {
    const { uuid, ...updateDto } = dto;

    const existingGrievance = await this.prisma.grievance.findUnique({
      where: { uuid },
    });
    if (!existingGrievance) {
      throw new RpcException('Grievance not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const isStatusChange = 'status' in updateDto;
      const isNowResolved = isStatusChange && updateDto.status === 'RESOLVED';
      const isNowClosed = isStatusChange && updateDto.status === 'CLOSED';

      const wasResolved = existingGrievance.status === 'RESOLVED';
      const wasClosed = existingGrievance.status === 'CLOSED';

      const shouldSetResolvedAt = isNowResolved && !wasResolved;
      const shouldSetClosedAt = isNowClosed && !wasClosed;

      const grievance = await tx.grievance.update({
        where: { uuid },
        data: {
          ...updateDto,
          ...(shouldSetResolvedAt ? { resolvedAt: new Date() } : {}),
          ...(shouldSetClosedAt ? { closedAt: new Date() } : {}),
        },
      });

      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          formatCoreUpdateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
          tx.grievance.update({
            where: { uuid },
            data: { status: existingGrievance.status },
          });
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }

  async update(dto: UpdateGrievanceDto) {
    const { uuid, ...updateDto } = dto;

    const existingGrievance = await this.prisma.grievance.findUnique({
      where: { uuid },
    });
    if (!existingGrievance) {
      throw new RpcException('Grievance not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Convert CreatedByUserDto to plain object for Prisma
      const { createdByUser, ...restUpdateData } = updateDto;
      const prismaUpdateData = {
        ...restUpdateData,
        ...(createdByUser && {
          createdByUser: {
            id: createdByUser.id,
            name: createdByUser.name,
            email: createdByUser.email,
          },
        }),
      };

      const grievance = await tx.grievance.update({
        where: { uuid },
        data: prismaUpdateData,
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.updated' },
          formatCoreUpdateGrievancePayload(grievance)
        ),
        onSuccess: async (res) => {
          console.log('Grievance updated successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error updating grievance:', error);
          tx.grievance.update({
            where: { uuid },
            data: prismaUpdateData,
          });
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }

  async findOne(uuid: string) {
    return this.prisma.grievance.findUnique({
      where: { uuid, deletedAt: null },
    });
  }

  async remove(uuid: string) {
    return this.prisma.$transaction(async (tx) => {
      const grievance = await tx.grievance.update({
        where: { uuid },
        data: { deletedAt: new Date() },
      });
      await handleMicroserviceCall({
        client: this.client.send(
          { cmd: 'rahat.jobs.grievance.removed' },
          grievance
        ),
        onSuccess: async (res) => {
          console.log('Grievance removed successfully', grievance);
          return res;
        },
        onError: (error) => {
          console.error('Error removing grievance:', error);
          throw new RpcException(error);
        },
      });
      return grievance;
    });
  }

  async getOverviewStats(): Promise<GrievanceStatsResponse> {
    const where = {
      deletedAt: null,
    };

    // Get total count
    const totalGrievances = await this.prisma.grievance.count({ where });

    // Get counts by type
    const typeStats = await this.prisma.grievance.groupBy({
      by: ['type'],
      where,
      _count: {
        type: true,
      },
    });

    // Get counts by status
    const statusStats = await this.prisma.grievance.groupBy({
      by: ['status'],
      where,
      _count: {
        status: true,
      },
    });

    // Format type stats
    const grievanceType = {
      TECHNICAL:
        typeStats.find((stat) => stat.type === 'TECHNICAL')?._count.type || 0,
      NON_TECHNICAL:
        typeStats.find((stat) => stat.type === 'NON_TECHNICAL')?._count.type ||
        0,
      OTHER: typeStats.find((stat) => stat.type === 'OTHER')?._count.type || 0,
    };

    // Format status stats
    const grievanceStatus = {
      NEW:
        statusStats.find((stat) => stat.status === 'NEW')?._count.status || 0,
      UNDER_REVIEW:
        statusStats.find((stat) => stat.status === 'UNDER_REVIEW')?._count
          .status || 0,
      RESOLVED:
        statusStats.find((stat) => stat.status === 'RESOLVED')?._count.status ||
        0,
      CLOSED:
        statusStats.find((stat) => stat.status === 'CLOSED')?._count.status ||
        0,
    };

    // Calculate average resolve time using createdAt -> closedAt for CLOSED grievances only
    const closedGrievances = await this.prisma.grievance.findMany({
      where: {
        ...where,
        status: 'CLOSED',
        closedAt: { not: null },
      },
      select: {
        createdAt: true,
        closedAt: true,
      },
    });

    let averageResolveTime = 0;

    if (closedGrievances.length > 0) {
      const totalResolveTimeMs = closedGrievances.reduce((total, grievance) => {
        const resolveTime =
          grievance.closedAt.getTime() - grievance.createdAt.getTime();
        return total + resolveTime;
      }, 0);

      averageResolveTime = Math.round(
        totalResolveTimeMs / closedGrievances.length
      );
    }

    return {
      totalGrievances,
      grievanceType,
      grievanceStatus,
      averageResolveTime,
    };
  }
}
