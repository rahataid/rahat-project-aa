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
  UpdateGroupCashTransferRecordDto,
} from './dto/group-cash-transfer.dto';
import { GctTreasuryService } from './gct-treasury.service';
import { GctOfframpClient } from './gct-offramp.client';
import { OtpService } from '../otp/otp.service';
import bcrypt from 'bcryptjs';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class GroupCashTransferService {
  private readonly logger = new Logger(GroupCashTransferService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;

  constructor(
    prisma: PrismaService,
    private readonly treasuryService: GctTreasuryService,
    private readonly offrampClient: GctOfframpClient,
    private readonly otpService: OtpService
  ) {
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
      
      const isBankDetailsChanged = data.bankDetails !== undefined;

      let baseExtras: Record<string, unknown>;
      if (data.extras !== undefined) {
        baseExtras = (data.extras as Record<string, unknown>) ?? {};
      } else {
        const existing = await this.db.groupCashTransferDetail.findUnique({ where: { uuid }, select: { extras: true } });
        baseExtras = (existing?.extras as Record<string, unknown>) ?? {};
      }

      const record = await this.db.groupCashTransferDetail.update({
        where: { uuid },
        data: {
          ...data,
          extras: {
            ...baseExtras,
            ...(isBankDetailsChanged ? { isBankValidated: false } : {}),
          }
        },
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

      const gctDetail = await this.findOneOrThrow(groupCashTransferId);

      // const existingFund = await this.db.groupCashTransferRecord.findFirst({
      //   where: { groupCashTransferId, deletedAt: null },
      // });
      // if (existingFund) {
      //   throw new RpcException('Funds have already been reserved for this group. Duplicate assignment is not allowed.');
      // }

      if (!gctDetail.extras.isBankValidated) {
        throw new RpcException('Bank account for this group has not been validated. Please validate the bank account before assigning funds.');
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
    const { page, perPage, groupCashTransferName, search, status, sort = 'createdAt', order = 'desc' } = dto;

    try {
      this.logger.log(`Fetching records for groupCashTransferName=${groupCashTransferName}`);

      let groupCashTransferId: string | undefined;
      if (groupCashTransferName) {
        const group = await this.db.groupCashTransferDetail.findFirst({
          where: { name: { contains: groupCashTransferName, mode: 'insensitive' }, deletedAt: null },
        });
        if (!group) {
          throw new RpcException(`Group cash transfer '${groupCashTransferName}' not found`);
        }
        groupCashTransferId = group.uuid;
      }

      const allowedSortFields = ['createdAt', 'title', 'amount'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'createdAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const where: Record<string, any> = {
        ...(groupCashTransferId && { groupCashTransferId }),
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

  async updateRecord(dto: UpdateGroupCashTransferRecordDto) {
    const { uuid, ...data } = dto;
    try {
      this.logger.log(`Updating group cash transfer record: ${uuid}`);

      const record = await this.db.groupCashTransferRecord.findFirst({
        where: { uuid, deletedAt: null },
      });

      if (!record) {
        throw new RpcException(`Record ${uuid} not found`);
      }

      if (record.disbursedAt) {
        throw new RpcException('Cannot edit: disbursal has already been initiated for this record');
      }

      const editableStatuses = ['NOT_STARTED', 'FAILED'];
      if (!editableStatuses.includes(record.status)) {
        throw new RpcException(`Cannot edit: record status is '${record.status}'. Only NOT_STARTED or FAILED records can be edited`);
      }

      return this.db.groupCashTransferRecord.update({
        where: { uuid },
        data,
      });
    } catch (error: any) {
      this.logger.error(`Failed to update record: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async sendOtp(email: string) {
    if (!email) {
      throw new RpcException('Email is required to send OTP');
    }

    const defaultOpt = await this.db.otp.findUnique({ where: { email } });

    const isExistingValid = defaultOpt?.otp && defaultOpt.expiresAt > new Date();

    // if existing OTP is expired, purge it so we can issue a fresh one
    if (defaultOpt && !isExistingValid) {
      await this.db.otp.delete({ where: { email } });
    }

    const { otp } = await this.otpService.sendEmail(
      email,
      'Group Cash Transfer Disbursement OTP',
      'Your OTP for disbursement is:',
      isExistingValid ? defaultOpt.otp : undefined
    );

    // if otp set in db and not expired, do not update otp, just resend existing otp
    if (isExistingValid) {
      return { success: true, message: 'OTP sent successfully' };
    }

    const expiry = new Date(Date.now() + 50 * 60 * 1000); // OTP valid for 50 minutes
    const otpHash = await bcrypt.hash(otp, 10);
    await this.db.otp.create({
      data: {
        otpHash,
        otp,
        email,
        expiresAt: expiry,
        amount: 0,
      },
    });

    this.logger.log(`Disbursement OTP sent to email: ${email}`);
    return { success: true, message: 'OTP sent successfully' };
  }

  private async verifyOtp(email?: string, otp?: string) {
    if (!email || !otp) {
      throw new RpcException('Email and OTP are required');
    }

    const otpRecord = await this.db.otp.findUnique({ where: { email } });
    if (!otpRecord) {
      throw new RpcException('OTP record not found');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new RpcException('OTP has expired');
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      throw new RpcException('Invalid OTP');
    }

    // consume OTP so it cannot be reused
    await this.db.otp.delete({ where: { email } });
  }

  async disburse(recordUuid: string, user: any, otp: string) {
    try {
      this.logger.log(`Initiating disbursement for group cash transfer record: ${recordUuid}`);

      await this.verifyOtp(user?.email, otp);

      const record = await this.db.groupCashTransferRecord.findFirst({
        where: { uuid: recordUuid, deletedAt: null },
      });

      if (!record) {
        throw new RpcException(`Group cash transfer record ${recordUuid} not found`);
      }

      if (record.status === 'COMPLETED') {
        throw new RpcException(`Record ${recordUuid} has already been disbursed`);
      }

      if (record.txHash) {
        this.logger.log(`Record ${recordUuid} already has a transfer, ready to confirm`);
        return {
          success: true,
          message: 'Transfer already initiated, ready to confirm',
          recordUuid,
          txHash: record.txHash,
        };
      }

      // if (!payoutProcessorId) {
      //   throw new RpcException('payoutProcessorId is required to initiate disbursement');
      // }


      const balance = await this.treasuryService.getBalance();
      if (balance < (record.amount ?? 0)) {
        throw new RpcException(
          `Insufficient budget: treasury balance ${balance} is less than requested amount ${record.amount}`
        );
      }

      const offrampWallet = await this.offrampClient.getOfframpWalletAddress();

      let txHash: string;
      try {
        txHash = await this.treasuryService.transfer(offrampWallet, record.amount ?? 0);
      } catch (error: any) {
        await this.db.groupCashTransferRecord.update({
          where: { uuid: recordUuid },
          data: {
            status: 'TOKEN_TRANSFER_FAILED',
            disbursementInfo: { error: error.message },
          },
        });
        throw new RpcException(`Token transfer failed: ${error.message}`);
      }

      await this.db.groupCashTransferRecord.update({
        where: { uuid: recordUuid },
        data: { txHash, status: 'TOKEN_TRANSFERRED', disbursementInfo: { disbursedBy: user.name } },
      });

      this.logger.log(`Token transferred for record=${recordUuid}, txHash=${txHash}`);
      return {
        success: true,
        message: 'Token transferred, ready to confirm disbursement',
        recordUuid,
        txHash,
      };
    } catch (error: any) {
      this.logger.error(`Failed to disburse: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async confirmDisburse(recordUuid: string, paymentProviderId: string) {
    try {
      this.logger.log(`Confirming disbursement for group cash transfer record: ${recordUuid}`);

      const record = await this.db.groupCashTransferRecord.findFirst({
        where: { uuid: recordUuid, deletedAt: null },
        include: { groupCashTransfer: true },
      });

      if (!record) {
        throw new RpcException(`Group cash transfer record ${recordUuid} not found`);
      }

      if (record.status === 'COMPLETED') {
        throw new RpcException(`Record ${recordUuid} has already been disbursed`);
      }

      if (!record.txHash) {
        throw new RpcException('Transfer not initiated — call disburse first');
      }

      if (!paymentProviderId) {
        throw new RpcException('payoutProcessorId not set — call disburse with a payoutProcessorId first');
      }

      const bankDetails = (record.groupCashTransfer?.bankDetails as any) || {};
      const payload = {
        tokenAmount: record.amount,
        transactionHash: record.txHash,
        paymentProviderId: paymentProviderId,
        senderAddress: await this.treasuryService.getTreasuryInfo().then(info => info.publicKey),
        xref: record.uuid,
        paymentDetails: {
          creditorAgent: bankDetails.bankCode,
          creditorAccount: bankDetails.accountNumber,
          creditorName: bankDetails.accountName,
          creditorBranch: bankDetails.branchId
        },
      };

      try {
        await this.db.groupCashTransferRecord.update({
          where: { uuid: recordUuid },
          data: { status: 'PENDING', payoutProcessorId: paymentProviderId },
        });

        const result = await this.offrampClient.instantOfframpV2(payload);
        const offrampStatus = result?.offrampRequest?.status;
        const isRejected = offrampStatus === 'REJECTED';

        await this.db.groupCashTransferRecord.update({
          where: { uuid: recordUuid },
          data: {
            status: isRejected ? 'REJECTED' : 'COMPLETED',
            disbursedAt: isRejected ? null : new Date(),
            disbursementInfo: { result }
          },
        });

        if (isRejected) {
          this.logger.warn(`Offramp rejected for record=${recordUuid}, status=${offrampStatus}`);
          return { success: false, message: `Disbursement rejected by offramp: ${offrampStatus}`, recordUuid };
        }

        this.logger.log(`Disbursement completed for record=${recordUuid}`);
        return { success: true, message: 'Disbursement completed', recordUuid };
      } catch (error: any) {
        await this.db.groupCashTransferRecord.update({
          where: { uuid: recordUuid },
          data: {
            status: 'FAILED',
            disbursementInfo: { error: error.message },
            payoutProcessorId: paymentProviderId,
          },
        });
        throw new RpcException(`Offramp request failed: ${error.message}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to confirm disburse: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getTreasuryInfo() {
    try {
      return await this.treasuryService.getTreasuryInfo();
    } catch (error: any) {
      this.logger.error(`Failed to fetch treasury info: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  // TODO: Complete after nchl api is working
  async getGCTData() {
    try {
      this.logger.log('Fetching GCT overview data');

      const [
        totalGroups,
        recordStats,
        disbursedStats,
        disbursedCount,
      ] = await Promise.all([
        this.db.groupCashTransferDetail.count({ where: { deletedAt: null } }),
        this.db.groupCashTransferRecord.aggregate({
          where: { deletedAt: null },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.db.groupCashTransferRecord.aggregate({
          where: { deletedAt: null, disbursedAt: { not: null } },
          _sum: { amount: true },
        }),
        this.db.groupCashTransferRecord.count({
          where: { deletedAt: null, disbursedAt: { not: null } },
        }),
      ]);

      const statusCounts = await this.db.groupCashTransferRecord.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      });

      const byStatus = statusCounts.reduce((acc: Record<string, number>, s: any) => {
        acc[s.status] = s._count._all;
        return acc;
      }, {} as Record<string, number>);

      let treasuryBalance: number | null = null;
      try {
        treasuryBalance = await this.treasuryService.getBalance();
      } catch (error: any) {
        this.logger.warn(`Could not fetch treasury balance for GCT overview: ${error.message}`);
      }

      const totalDisbursedAmount = disbursedStats._sum.amount ?? 0;
      const totalAllocatedAmount = recordStats._sum.amount ? recordStats._sum.amount - totalDisbursedAmount : 0;

      return {
        totalGroups,
        totalRecords: recordStats._count?._all ?? 0,
        totalAllocatedAmount,
        totalDisbursedAmount,
        disbursedCount,
        pendingCount: byStatus['PENDING'] ?? 0,
        notStartedCount: byStatus['NOT_STARTED'] ?? 0,
        failedCount: byStatus['FAILED'] ?? 0,
        tokenDisbursedCount: byStatus['TOKEN_TRANSFERRED'] ?? 0,
        rejectedCount: byStatus['REJECTED'] ?? 0,
        treasuryBalance,
        remainingBudget: treasuryBalance !== null ? treasuryBalance - totalAllocatedAmount : null,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch GCT overview data: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async validateBankAccount(dto: {
    groupUuid: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    bankId: string;
  }) {
    try {
      this.logger.log(`Validating bank account for group: ${dto.groupUuid}`);
      const record = await this.findOneOrThrow(dto.groupUuid);

      if (!dto.bankId) throw new RpcException(`Bank not found: ${dto.bankName}`);

      const result = await this.offrampClient.validateBankAccount({
        bankId: dto.bankId,
        accountName: dto.accountName,
        accountId: dto.accountNumber,
      });

      this.logger.log(`Bank account validation result for group ${dto.groupUuid}: ${JSON.stringify(result)}`);

      const isValid = result?.isValid === true;
      const existingExtras = (record.extras as Record<string, unknown>) ?? {};
      const existingBankDetails = (record.bankDetails as Record<string, unknown>) ?? {};

      if (!isValid) {
        const errorMessage = result?.cipsData?.responseMessage ?? 'Bank account validation failed';
        this.logger.error(`Bank account validation failed for group ${dto.groupUuid}: ${errorMessage}`);
        await this.db.groupCashTransferDetail.update({
          where: { uuid: dto.groupUuid },
          data: {
            extras: {
              ...existingExtras,
              isBankValidated: false,
              validationError: errorMessage,
             bankValidatedAt: null 
            },
          },
        });
        return { valid: false, message: errorMessage, result };
      }

      await this.db.groupCashTransferDetail.update({
        where: { uuid: dto.groupUuid },
        data: {
          bankDetails: {
            ...existingBankDetails,
            branchId: result?.cipsData?.branchId,
          },
          extras: {
            ...existingExtras,
            isBankValidated: true,
            bankValidatedAt: new Date().toISOString(),
            validationError: null,
          },
        },
      });

      return { valid: true, result };
    } catch (error: any) {
      this.logger.error(`Failed to validate bank account: ${error.message}`, error.stack);
      throw new RpcException(error.message);
    }
  }

  async getAllValidGroupTransfers() {
    try {
      this.logger.log('Fetching all valid group transfers (bank validated, no funds assigned)');
      return this.db.groupCashTransferDetail.findMany({
        where: {
          deletedAt: null,
          extras: { path: ['bankValidatedAt'], not: Prisma.JsonNull },
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
    const bankName = (dto.bankDetails as any)?.bankName;
    if (accountNumber && bankName) {
      checks.push({
        field: 'account number and bank name',
        where: {
          ...base,
          AND: [
            { bankDetails: { path: ['accountNumber'], equals: accountNumber } },
            { bankDetails: { path: ['bankName'], equals: bankName } },
          ],
        },
      });
    }

    const email = (dto.bankDetails as any)?.email;
    if (email) {
      checks.push({
        field: 'email',
        where: { ...base, bankDetails: { path: ['email'], equals: email } },
      });
    }

    const results = await Promise.all(
      checks.map(({ where }) => this.db.groupCashTransferDetail.findFirst({ where, select: { uuid: true } }))
    );
    const hit = results.findIndex((r) => r !== null);
    if (hit !== -1) throw new RpcException(`A group with this ${checks[hit].field} already exists`);
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
