import { Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  AssignFundDto,
  CreateGroupCashTransferDto,
  ListGroupCashTransferDto,
  UpdateGroupCashTransferDto,
} from './dto/group-cash-transfer.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class GroupCashTransferService {
  private readonly logger = new Logger(GroupCashTransferService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;

  constructor(prisma: PrismaService) {
    this.db = prisma;
  }

  async create(dto: CreateGroupCashTransferDto) {
    try {
      this.logger.log(`Creating group cash transfer: ${dto.name}`);
      const existing = await this.db.groupCashTransferDetail.findFirst({
        where: { name: dto.name, deletedAt: null },
      });

      if (existing) {
        throw new RpcException(`Group cash transfer '${dto.name}' already exists`);
      }

      const record = await this.db.groupCashTransferDetail.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          bankDetails: dto.bankDetails,
          extras: dto.extras,
        },
      });

      this.logger.log(`Group cash transfer created: ${record.uuid}`);
      return record;
    } catch (error: any) {
      this.logger.error(`Failed to create group cash transfer: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async update(dto: UpdateGroupCashTransferDto) {
    const { uuid, ...data } = dto;
    try {
      this.logger.log(`Updating group cash transfer: ${uuid}`);
      await this.findOneOrThrow(uuid);

      const record = await this.db.groupCashTransferDetail.update({
        where: { uuid },
        data,
      });

      this.logger.log(`Group cash transfer updated: ${uuid}`);
      return record;
    } catch (error: any) {
      this.logger.error(`Failed to update group cash transfer: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async delete(uuid: string) {
    try {
      this.logger.log(`Soft deleting group cash transfer: ${uuid}`);
      await this.findOneOrThrow(uuid);

      const fundCount = await this.db.groupCashTransferRecord.count({
        where: { groupCashTransferId: uuid, deletedAt: null },
      });

      if (fundCount > 0) {
        throw new RpcException('Cannot delete: fund has already been assigned to this group');
      }

      await this.db.groupCashTransferDetail.update({
        where: { uuid },
        data: { deletedAt: new Date() },
      });

      this.logger.log(`Group cash transfer soft deleted: ${uuid}`);
      return { success: true, message: 'Group cash transfer deleted successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to delete group cash transfer: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async get(payload: ListGroupCashTransferDto) {
    const {
      page,
      perPage,
      search,
      sort = 'createdAt',
      order = 'desc',
    } = payload;

    try {
      this.logger.log(`Fetching group cash transfers`);

      const where: Record<string, any> = {
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const allowedSortFields = ['createdAt', 'name'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'createdAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      return paginate(
        this.db.groupCashTransferDetail,
        {
          where,
          orderBy: { [safeSort]: safeOrder },
          include: {
            groupCashTransferRecords: {
              where: { deletedAt: null },
              select: {
                uuid: true,
                amount: true,
                status: true,
                payoutProcessorId: true,
              },
            },
          },
        },
        { page, perPage }
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch group cash transfers: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getOne(uuid: string) {
    try {
      this.logger.log(`Fetching group cash transfer: ${uuid}`);
      const record = await this.findOneOrThrow(uuid);

      const records = await this.db.groupCashTransferRecord.findMany({
        where: { groupCashTransferId: uuid, deletedAt: null },
      });

      const totalAmount = records.reduce((sum, r) => sum + (r.amount ?? 0), 0);

      return {
        ...record,
        totalAmount,
        totalRecords: records.length,
        records,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch group cash transfer: ${error.message}`, error.stack);
      throw error;
    }
  }

  async assignFund(dto: AssignFundDto) {
    const { groupCashTransferId, amount } = dto;

    try {
      this.logger.log(
        `Assigning fund: groupCashTransferId=${groupCashTransferId}, amount=${amount}`
      );

      await this.findOneOrThrow(groupCashTransferId);

      const record = await this.db.groupCashTransferRecord.create({
        data: {
          groupCashTransferId,
          amount,
          status: 'NOT_STARTED',
        },
      });

      this.logger.log(`Fund assigned: record=${record.uuid}`);
      return record;
    } catch (error: any) {
      this.logger.error(`Failed to assign fund: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async disburse(recordUuid: string) {
    try {
      this.logger.log(`Disbursing group cash transfer record: ${recordUuid}`);

      const record = await this.db.groupCashTransferRecord.findFirst({
        where: { uuid: recordUuid, deletedAt: null },
      });

      if (!record) {
        throw new RpcException(`Group cash transfer record ${recordUuid} not found`);
      }

      await this.db.groupCashTransferRecord.update({
        where: { uuid: recordUuid },
        data: { status: 'PENDING' },
      });

      this.logger.log(`Disburse initiated for record=${recordUuid}, status set to PENDING`);
      return { success: true, message: 'Disburse initiated', recordUuid };
    } catch (error: any) {
      this.logger.error(`Failed to disburse: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  private async findOneOrThrow(uuid: string) {
    const record = await this.db.groupCashTransferDetail.findFirst({
      where: { uuid, deletedAt: null },
    });

    if (!record) {
      throw new RpcException(`Group cash transfer with UUID ${uuid} not found`);
    }

    return record;
  }
}
