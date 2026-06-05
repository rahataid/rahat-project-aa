import { Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  AssignFundDto,
  CreateGroupCashTransferDto,
  ListGroupCashTransferDto,
  ListGroupCashTransferRecordDto,
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

      await this.checkUniqueness(dto);

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

      await this.checkUniqueness(dto, uuid);

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
      phone,
      ward,
      supportArea,
      sort = 'createdAt',
      order = 'desc',
      hasFund,
    } = payload;

    try {
      this.logger.log(`Fetching group cash transfers`);

      const areas = supportArea
        ? Array.isArray(supportArea)
          ? supportArea
          : [supportArea]
        : [];

      let supportAreaUuids: string[] | null = null;
      if (areas.length > 0) {
        const matched = await Promise.all(
          areas.map((area) =>
            this.db.$queryRaw<{ uuid: string }[]>`
              SELECT uuid FROM tbl_group_cash_transfer_details
              WHERE "deletedAt" IS NULL
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(extras->'supportArea') AS s
                WHERE s ILIKE ${'%' + area + '%'}
              )
            `
          )
        );
        const uuids = [...new Set(matched.flat().map((r) => r.uuid))];
        supportAreaUuids = uuids;
      }

      const where: Record<string, any> = {
        deletedAt: null,
        ...(search && {
          name: { contains: search, mode: 'insensitive' },
        }),
        ...(phone && {
          phone: { contains: phone, mode: 'insensitive' },
        }),
        ...(ward && {
          extras: { path: ['ward'], string_contains: ward },
        }),
        ...(supportAreaUuids && {
          uuid: { in: supportAreaUuids },
        }),
        ...(hasFund === true && {
          groupCashTransferRecords: { some: { deletedAt: null } },
        }),
        ...(hasFund === false && {
          groupCashTransferRecords: { none: { deletedAt: null } },
        }),
      };

      const allowedSortFields = ['createdAt', 'name'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'createdAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const result = await paginate(
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

      result.data = result.data.map((item: any) => ({
        ...item,
        totalAssignedAmount: item.groupCashTransferRecords.reduce(
          (sum: number, r: any) => sum + (r.amount ?? 0),
          0
        ),
      }));

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to fetch group cash transfers: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getOne(uuid: string) {
    try {
      this.logger.log(`Fetching group cash transfer: ${uuid}`);

      const record = await this.db.groupCashTransferDetail.findFirst({
        where: { uuid, deletedAt: null },
        include: {
          groupCashTransferRecords: {
            where: { deletedAt: null },
            select: {
              uuid: true,
              title: true,
              amount: true,
              status: true,
              payoutProcessorId: true,
              createdBy: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!record) {
        throw new RpcException(`Group cash transfer with UUID ${uuid} not found`);
      }

      const totalAmount = record.groupCashTransferRecords.reduce(
        (sum: number, r: any) => sum + (r.amount ?? 0),
        0
      );

      return {
        ...record,
        totalAmount,
        totalRecords: record.groupCashTransferRecords.length,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch group cash transfer: ${error.message}`, error.stack);
      throw error;
    }
  }

  async assignFund(dto: AssignFundDto) {
    const { groupCashTransferId, title, amount, user } = dto;

    try {
      this.logger.log(
        `Assigning fund: groupCashTransferId=${groupCashTransferId}, amount=${amount}`
      );

      await this.findOneOrThrow(groupCashTransferId);

      const existingFund = await this.db.groupCashTransferRecord.findFirst({
        where: { groupCashTransferId, deletedAt: null },
      });
      if (existingFund) {
        throw new RpcException('Funds have already been reserved for this group. Duplicate assignment is not allowed.');
      }

      const record = await this.db.groupCashTransferRecord.create({
        data: {
          groupCashTransferId,
          title,
          amount,
          status: 'NOT_STARTED',
          createdBy: user?.name || null,
        },
      });

      this.logger.log(`Fund assigned: record=${record.uuid}`);
      return record;
    } catch (error: any) {
      this.logger.error(`Failed to assign fund: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getRecords(dto: ListGroupCashTransferRecordDto) {
    const { page, perPage, groupCashTransferId, search, status, sort = 'createdAt', order = 'desc' } = dto;

    try {
      this.logger.log(`Fetching records for groupCashTransferId=${groupCashTransferId}`);

      await this.findOneOrThrow(groupCashTransferId);

      const allowedSortFields = ['createdAt', 'title', 'amount'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'createdAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const where: Record<string, any> = {
        groupCashTransferId,
        deletedAt: null,
        ...(status && { status }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { groupCashTransfer: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }),
      };

      return paginate(
        this.db.groupCashTransferRecord,
        {
          where,
          orderBy: { [safeSort]: safeOrder },
          include: {
            groupCashTransfer: {
              select: { uuid: true, name: true },
            },
          },
        },
        { page, perPage }
      );
    } catch (error: any) {
      this.logger.error(`Failed to fetch records: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getOneRecord(recordUuid: string) {
    try {
      this.logger.log(`Fetching group cash transfer record: ${recordUuid}`);

      const record = await this.db.groupCashTransferRecord.findFirst({
        where: { uuid: recordUuid, deletedAt: null },
        include: {
          groupCashTransfer: {
            select: { uuid: true, name: true, phone: true, bankDetails: true },
          },
        },
      });

      if (!record) {
        throw new RpcException(`Group cash transfer record ${recordUuid} not found`);
      }

      return record;
    } catch (error: any) {
      this.logger.error(`Failed to fetch record: ${error.message}`, error.stack);
      throw error;
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

  // TODO: Complete after nchl api is working
  async validateBankAccount(_dto: unknown) {
    return { valid: true };
  }

  async getAllValidGroupTransfers() {
    try {
      this.logger.log('Fetching all valid group transfers (no funds assigned)');
      return this.db.groupCashTransferDetail.findMany({
        where: {
          deletedAt: null,
          groupCashTransferRecords: { none: { deletedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: any) {
      this.logger.error(`Failed to fetch valid group transfers: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  private async checkUniqueness(
    dto: { name?: string; phone?: string; bankDetails?: Record<string, unknown> },
    excludeUuid?: string,
  ) {
    const base: Record<string, any> = { deletedAt: null };
    if (excludeUuid) base.uuid = { not: excludeUuid };

    const checks: Array<{ field: string; where: Record<string, any> }> = [];

    if (dto.name) {
      checks.push({ field: 'name', where: { ...base, name: dto.name } });
    }

    if (dto.phone) {
      checks.push({ field: 'phone', where: { ...base, phone: dto.phone } });
    }

    const accountNumber = (dto.bankDetails as any)?.accountNumber;
    if (accountNumber) {
      checks.push({
        field: 'account number',
        where: { ...base, bankDetails: { path: ['accountNumber'], equals: accountNumber } },
      });
    }

    const email = (dto.bankDetails as any)?.email;
    if (email) {
      checks.push({
        field: 'email',
        where: { ...base, bankDetails: { path: ['email'], equals: email } },
      });
    }

    for (const { field, where } of checks) {
      const existing = await this.db.groupCashTransferDetail.findFirst({ where });
      if (existing) {
        throw new RpcException(`A group with this ${field} already exists`);
      }
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
