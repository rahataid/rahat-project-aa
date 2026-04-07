import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InkindStockMovementType, Prisma } from '@prisma/client';
import {
  CreateInkindDto,
  UpdateInkindDto,
  ListInkindDto,
  InkindType,
  BeneficiaryInkindRedeemDto,
  UserObject,
  GetGroupInkindLogsDto,
  GetVendorInkindLogsDto,
  InkindTxStatus,
} from './dto/inkind.dto';
import {
  AddInkindStockDto,
  ListStockMovementsDto,
  RemoveInkindStockDto,
} from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';
import {
  PreDefinedRedemptionItem,
  WalkInRedemptionItem,
  PreDefinedRedemptionResult,
  WalkInRedemptionResult,
  CreateGroupPayload,
  CreateGroupResponse,
  AssignBeneficiariesPayload,
  AssignBeneficiariesResponse,
  InkindRecord,
  BeneficiaryRedemptionResponse,
} from './dto/inkind.type';
import { OtpService } from '../otp/otp.service';
import bcrypt from 'bcryptjs';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class InkindsService {
  private readonly logger = new Logger(InkindsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private configService: ConfigService,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    @Inject(CORE_MODULE) private readonly client: ClientProxy
  ) {}

  async create(createInkindDto: CreateInkindDto) {
    const { quantity, ...inkindData } = createInkindDto;

    try {
      this.logger.log(`Creating new inkind item: ${inkindData.name}`);
      const existingInkind = await this.prisma.inkind.findFirst({
        where: { name: inkindData.name, deletedAt: null },
      });

      if (existingInkind) {
        throw new RpcException(
          `Inkind with name '${inkindData.name}' already exists`
        );
      }

      const inkind = await this.prisma.$transaction(async (tx) => {
        const created = await tx.inkind.create({
          data: {
            name: inkindData.name,
            type: inkindData.type,
            description: inkindData.description,
            image: inkindData.image,
          },
        });

        if (quantity) {
          await tx.inkindStockMovement.create({
            data: {
              inkindId: created.uuid,
              quantity,
              type: InkindStockMovementType.ADD,
            },
          });
          created.availableStock = quantity; // Attach quantity to the created inkind for response
        }

        return created;
      });

      this.logger.log(`Inkind created successfully: ${inkind.uuid}`);
      return inkind;
    } catch (error) {
      this.logger.error(
        `Failed to create inkind: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async update(updateInkindDto: UpdateInkindDto) {
    const { uuid, ...data } = updateInkindDto;

    try {
      this.logger.log(`Updating inkind item: ${uuid}`);

      await this.findOneOrThrow(uuid);

      const inkind = await this.prisma.inkind.update({
        where: { uuid },
        data,
      });

      this.logger.log(`Inkind updated successfully: ${uuid}`);
      return inkind;
    } catch (error) {
      this.logger.error(
        `Failed to update inkind: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async delete(uuid: string) {
    try {
      this.logger.log(`Soft deleting inkind item: ${uuid}`);

      await this.findOneOrThrow(uuid);

      await this.prisma.inkind.update({
        where: { uuid },
        data: { deletedAt: new Date() },
      });

      this.logger.log(`Inkind soft deleted: ${uuid}`);
      return { success: true, message: 'Inkind item deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Failed to delete inkind: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async get(payload: ListInkindDto) {
    try {
      const {
        page,
        perPage,
        type,
        name,
        sort = 'createdAt',
        order = 'desc',
      } = payload;

      this.logger.log(
        `Fetching inkinds with filters: ${JSON.stringify(payload)}`
      );

      const where: Prisma.InkindWhereInput = {
        deletedAt: null,
        ...(type && { type }),
        ...(name && {
          name: { contains: name, mode: 'insensitive' },
        }),
      };

      const allowedSortFields: Array<
        keyof Prisma.InkindOrderByWithRelationInput
      > = ['createdAt', 'name', 'type', 'availableStock'];

      const safeSort = allowedSortFields.includes(
        sort as keyof Prisma.InkindOrderByWithRelationInput
      )
        ? (sort as keyof Prisma.InkindOrderByWithRelationInput)
        : 'createdAt';

      const safeOrder: Prisma.SortOrder =
        order === 'asc' || order === 'desc' ? order : 'desc';

      const orderBy: Prisma.InkindOrderByWithRelationInput = {
        [safeSort]: safeOrder,
      };

      const result = await paginate(
        this.prisma.inkind,
        {
          where,
          orderBy,
          include: {
            groupInkinds: {
              select: {
                group: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        { page, perPage }
      );

      const uuids = result.data.map((item: { uuid: string }) => item.uuid);

      const assignments = await this.prisma.groupInkind.groupBy({
        by: ['inkindId'],
        where: { inkindId: { in: uuids } },
        _sum: {
          quantityAllocated: true,
          quantityRedeemed: true,
        },
      });

      const assignmentMap = new Map(
        assignments.map((a) => [a.inkindId, a._sum])
      );

      result.data = result.data.map((item: { uuid: string }) => ({
        ...item,
        totalAssigned: assignmentMap.get(item.uuid)?.quantityAllocated ?? 0,
        totalRedeemed: assignmentMap.get(item.uuid)?.quantityRedeemed ?? 0,
      }));

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkinds: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getInkindSummary() {
    try {
      this.logger.log(`Fetching inkind summary`);

      const [summary, totalAssignedStock] = await Promise.all([
        this.prisma.inkind.aggregate({
          where: { deletedAt: null },
          _count: {
            id: true,
          },
          _sum: {
            availableStock: true,
          },
        }),
        this.prisma.groupInkind.aggregate({
          _sum: {
            quantityAllocated: true,
            quantityRedeemed: true,
          },
        }),
      ]);

      this.logger.log(`Inkind summary fetched successfully`);
      return {
        totalInkindTypes: summary._count.id,
        totalStock: summary._sum.availableStock,
        totalAvailableStock:
          summary._sum.availableStock -
          (totalAssignedStock._sum.quantityAllocated || 0),
        totalAssignedStock: totalAssignedStock._sum.quantityAllocated,
        totalRedeemedStock: totalAssignedStock._sum.quantityRedeemed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkind summary: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getOne(uuid: string) {
    try {
      this.logger.log(`Fetching inkind: ${uuid}`);
      const data = await this.findOneOrThrow(uuid);

      const totalAssignedInkind = await this.prisma.groupInkind.aggregate({
        where: { inkindId: uuid },
        _sum: {
          quantityAllocated: true,
          quantityRedeemed: true,
        },
      });
      return {
        ...data,
        totalAssigned: totalAssignedInkind._sum.quantityAllocated || 0,
        totalRedeemed: totalAssignedInkind._sum.quantityRedeemed || 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkind: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  private async findOneOrThrow(uuid: string) {
    const inkind = await this.prisma.inkind.findFirst({
      where: { uuid, deletedAt: null },
    });

    if (!inkind) {
      throw new RpcException(`Inkind with UUID ${uuid} not found`);
    }

    return inkind;
  }

  // Inkinds stock management
  async addInkindStock(payload: AddInkindStockDto) {
    const { inkindId, quantity, groupInkindId, redemptionId } = payload;

    if (!inkindId || quantity == null || quantity <= 0) {
      throw new RpcException('Missing or invalid required fields');
    }

    try {
      this.logger.log(
        `Adding stock for inkind: ${inkindId}, quantity: ${quantity}`
      );

      await this.findOneOrThrow(inkindId);

      return this.prisma.inkindStockMovement.create({
        data: {
          inkindId,
          quantity,
          type: InkindStockMovementType.ADD,
          groupInkindId,
          redemptionId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to add inkind stock: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getAllStockMovements(payload: ListStockMovementsDto) {
    const { page, perPage, order = 'desc', type } = payload;
    this.logger.log(`Fetching all inkind stock movements`);
    try {
      const where: Prisma.InkindStockMovementWhereInput = {
        type: type ? type : { not: InkindStockMovementType.REDEEM },
      };

      return paginate(
        this.prisma.inkindStockMovement,
        {
          where,
          include: {
            inkind: true,
            groupInkind: {
              select: {
                group: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            redemption: true,
          },
          orderBy: { createdAt: order },
        },
        { page, perPage }
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkind stock movements: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async removeInkindStock(payload: RemoveInkindStockDto) {
    const { inkindUuid, quantity } = payload;

    this.logger.log(`Removing stock for inkind: ${inkindUuid}`);

    if (!inkindUuid) {
      throw new RpcException('Missing inkindUuid field');
    }

    try {
      await this.findOneOrThrow(inkindUuid);
      return await this.prisma.inkindStockMovement.create({
        data: {
          inkindId: inkindUuid,
          quantity: quantity,
          type: InkindStockMovementType.REMOVE,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to remove inkind stock: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  // Group inkinds management
  async getUnassignedInkindGroups(uuid: string) {
    this.logger.log(`Fetching unassigned groups for inkind: ${uuid}`);
    try {
      return await this.prisma.beneficiaryGroups.findMany({
        where: {
          groupInkinds: {
            none: {
              inkindId: uuid,
            },
          },
          NOT: {
            name: { startsWith: 'Walk-in' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch unassigned groups for inkind ${uuid}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async assignGroupInkind(payload: AssignGroupInkindDto) {
    const { inkindId, groupId, quantity, user } = payload;
    const newQuantity = quantity || 1;

    this.logger.log(
      `Assigning group inkind: inkindId=${inkindId}, groupId=${groupId}, quantity=${newQuantity}`
    );

    if (!inkindId || !groupId) {
      throw new RpcException('Missing required fields');
    }
    const inkind = await this.findOneOrThrow(inkindId);

    if (inkind.type === InkindType.WALK_IN) {
      throw new RpcException('Walk-in inkinds cannot be assigned to groups');
    }

    const existingAssignment = await this.prisma.groupInkind.findFirst({
      where: { groupId, inkindId },
    });

    if (existingAssignment) {
      throw new RpcException(`Inkind is already assigned to this group.`);
    }

    const numberOfGroupBeneficiaries =
      await this.prisma.beneficiaryToGroup.count({
        where: { groupId },
      });

    if (numberOfGroupBeneficiaries === 0) {
      throw new RpcException(`No beneficiaries found in the group.`);
    }

    const totalNeedInkindQuantity = newQuantity * numberOfGroupBeneficiaries;
    const availableStock = inkind.availableStock || 0;

    if (totalNeedInkindQuantity > availableStock) {
      throw new RpcException(
        `Not enough stock available. Requested: ${totalNeedInkindQuantity}, Available: ${availableStock}`
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const groupInkind = await tx.groupInkind.create({
          data: {
            groupId,
            inkindId,
            quantityAllocated: totalNeedInkindQuantity,
            createdBy: user?.name || 'system',
          },
        });
        await tx.inkindStockMovement.create({
          data: {
            inkindId,
            quantity: totalNeedInkindQuantity,
            type: InkindStockMovementType.LOCK,
            groupInkindId: groupInkind.uuid,
          },
        });
      });
      this.logger.log(
        `Group inkind assigned successfully: groupId=${groupId}, inkindId=${inkindId}, quantity=${newQuantity}`
      );
      return { success: true, message: 'Group inkind assigned successfully' };
    } catch (error) {
      this.logger.error(
        `Failed to assign group inkind: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getByGroup(inkindType?: string) {
    const where = inkindType
      ? {
          inkind: {
            type: inkindType,
          },
        }
      : undefined;

    try {
      this.logger.log(`Fetching inkinds by group`);
      const groupInkinds = await this.prisma.groupInkind.findMany({
        where,
        include: {
          inkind: true,
          group: {
            include: {
              _count: {
                select: { beneficiaries: true },
              },
            },
          },
        },
      });

      return groupInkinds;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkinds by group: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getAvailableInkindByBeneficiary(number: string) {
    this.logger.log(
      `Fetching available inkind details for beneficiary: ${number}`
    );

    if (!number) {
      throw new RpcException('Beneficiary phone number is required');
    }

    try {
      const beneficiary = await this.prisma.beneficiary.findFirst({
        where: {
          extras: { path: ['phone'], equals: number },
        },
      });

      if (!beneficiary) {
        return {
          isBeneficiaryExists: false,
          beneficiary: null,
          preDefinedInkinds: [],
          walkInInkinds: [],
        };
      }

      const [formattedGroups, walkInInkinds] = await Promise.all([
        this.getBenificiaryAssignedInkindByWallet(beneficiary.walletAddress),
        this.getBeneficiaryAssignedWalkinInkinds(beneficiary.walletAddress),
      ]);

      return {
        isBeneficiaryExists: true,
        beneficiary,
        preDefinedInkinds: formattedGroups,
        walkInInkinds,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkind details for beneficiary: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  private async getBenificiaryAssignedInkindByWallet(walletAddress: string) {
    try {
      const groups = await this.prisma.groupInkind.findMany({
        where: {
          group: {
            beneficiaries: {
              some: {
                beneficiary: {
                  walletAddress: walletAddress,
                },
              },
            },
          },
          redemptions: {
            none: {
              beneficiaryWallet: walletAddress,
            },
          },
        },
        select: {
          uuid: true,
          quantityAllocated: true,
          inkind: {
            select: {
              uuid: true,
              name: true,
              type: true,
            },
          },
          group: {
            select: {
              uuid: true,
              _count: { select: { beneficiaries: true } },
            },
          },
        },
      });

      const formattedGroups = groups.map((group) => {
        const memberCount = group.group._count.beneficiaries;
        return {
          uuid: group.inkind.uuid,
          groupInkindId: group.uuid,
          quantityAllocated: group.quantityAllocated / memberCount,
          inkindName: group.inkind.name,
          inkindType: group.inkind.type,
          groupId: group.group.uuid,
        };
      });

      return formattedGroups;
    } catch (error) {
      this.logger.error(
        `Failed to fetch assigned inkinds for beneficiary: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  private async getBeneficiaryAssignedWalkinInkinds(walletAddress: string) {
    try {
      const walkInInkinds = await this.prisma.inkind.findMany({
        where: {
          type: InkindType.WALK_IN,
          availableStock: {
            gt: 0,
          },
          deletedAt: null,
          groupInkinds: {
            none: {
              group: {
                beneficiaries: {
                  some: {
                    beneficiary: {
                      walletAddress: walletAddress,
                    },
                  },
                },
              },
            },
          },
        },
        select: {
          uuid: true,
          name: true,
          type: true,
          availableStock: true,
        },
      });
      return walkInInkinds;
    } catch (error) {
      this.logger.error(
        `Failed to fetch walk-in inkinds for beneficiary: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  async getLogsByGroupInkindForVendor(payload: GetVendorInkindLogsDto) {
    const {
      vendorId,
      search,
      sort = 'redeemedAt',
      order = 'desc',
      page = 1,
      perPage = 10,
      fromDate,
      toDate,
    } = payload;

    this.logger.log(`Fetching inkind redemption logs for vendor: ${vendorId}`);

    if (!vendorId) {
      throw new RpcException('vendorId is required');
    }

    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorId },
        select: { uuid: true, name: true, walletAddress: true },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${vendorId} not found`);
      }

      const where: Prisma.BeneficiaryInkindRedemptionWhereInput = {
        vendorUid: vendorId,
        ...(search && {
          OR: [
            { beneficiaryWallet: { contains: search, mode: 'insensitive' } },
            {
              beneficiary: {
                extras: {
                  path: ['name'],
                  string_contains: search,
                },
              },
            },
            {
              groupInkind: {
                inkind: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        }),
        ...(fromDate &&
          toDate && {
            redeemedAt: {
              gte: fromDate,
              lte: toDate,
            },
          }),
      };

      // Build order by
      const allowedSortFields = ['redeemedAt', 'quantity'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'redeemedAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const orderBy: Prisma.BeneficiaryInkindRedemptionOrderByWithRelationInput =
        {
          [safeSort]: safeOrder,
        };

      // Build query for paginate function
      const query: Prisma.BeneficiaryInkindRedemptionFindManyArgs = {
        where,
        orderBy,
        include: {
          beneficiary: {
            select: {
              uuid: true,
              walletAddress: true,
              phone: true,
              extras: true,
            },
          },
          groupInkind: {
            select: {
              uuid: true,
              inkind: {
                select: {
                  uuid: true,
                  name: true,
                  type: true,
                },
              },
              group: {
                select: {
                  uuid: true,
                  name: true,
                },
              },
            },
          },
        },
      };

      // Get stats for this vendor
      const [totalRedemptions, totalQuantityRedeemed, todayRedemptions] =
        await Promise.all([
          this.prisma.beneficiaryInkindRedemption.count({
            where: { vendorUid: vendorId },
          }),
          this.prisma.beneficiaryInkindRedemption.aggregate({
            where: { vendorUid: vendorId },
            _sum: { quantity: true },
          }),
          this.prisma.beneficiaryInkindRedemption.count({
            where: {
              vendorUid: vendorId,
              redeemedAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
          }),
        ]);

      // Use paginate function
      const result = await paginate(
        this.prisma.beneficiaryInkindRedemption,
        query,
        { page, perPage }
      );

      const groupedMap = new Map<
        string,
        { txHash: string | null; date: Date }
      >();
      for (const redemption of result.data as any[]) {
        const key = redemption.txHash ?? '__no_txhash__';
        if (!groupedMap.has(key)) {
          groupedMap.set(key, {
            txHash: redemption.txHash ?? null,
            date: redemption.redeemedAt,
          });
        }
      }
      const formattedLogs = Array.from(groupedMap.values());

      return {
        data: {
          vendor: {
            uuid: vendor.uuid,
            name: vendor.name,
            walletAddress: vendor.walletAddress,
          },
          stats: {
            totalRedemptions,
            totalQuantityRedeemed: totalQuantityRedeemed._sum.quantity || 0,
            todayRedemptions,
          },
          logs: formattedLogs,
        },
        meta: result.meta,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch logs for vendor ${vendorId}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getLogsDetailsByTxHash(txHash: string, vendorUid: string) {
    this.logger.log(`Fetching redemption details for txHash: ${txHash}`);

    if (!vendorUid) {
      throw new RpcException('vendorUid is required');
    }

    try {
      const redemptions =
        await this.prisma.beneficiaryInkindRedemption.findMany({
          where: { txHash: txHash ?? null, vendorUid },
          include: {
            beneficiary: {
              select: {
                walletAddress: true,
                extras: true,
              },
            },
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
          },
        });

      if (redemptions.length === 0) {
        throw new RpcException(`No redemptions found for txHash: ${txHash}`);
      }

      const first = redemptions[0];
      const extras = first.beneficiary.extras as Record<string, unknown>;

      return {
        beneficiaryWalletAddress: first.beneficiary.walletAddress,
        phone: (extras?.phone as string) ?? null,
        txHash: first.txHash,
        status: first.txHash ? 'Completed' : 'Pending',
        timestamp: first.redeemedAt,
        claimedInkinds: redemptions.map((r) => ({
          quantity: r.quantity,
          name: r.groupInkind.inkind.name,
          type: r.groupInkind.inkind.type,
        })),
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch redemption details for txHash ${txHash}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getLogsByGroupInkind(payload: GetGroupInkindLogsDto) {
    const {
      groupInkindId,
      search,
      sort = 'redeemedAt',
      order = 'desc',
      page = 1,
      perPage = 10,
    } = payload;

    this.logger.log(`Fetching logs for groupInkindId: ${groupInkindId}`);

    if (!groupInkindId) {
      throw new RpcException('groupInkindId is required');
    }

    try {
      const groupInkind = await this.prisma.groupInkind.findUnique({
        where: { uuid: groupInkindId },
        include: {
          inkind: {
            select: { uuid: true, name: true, type: true },
          },
          group: {
            select: {
              uuid: true,
              name: true,
              _count: { select: { beneficiaries: true } },
            },
          },
        },
      });

      if (!groupInkind) {
        throw new RpcException(
          `GroupInkind with UUID ${groupInkindId} not found`
        );
      }

      const where: Prisma.BeneficiaryInkindRedemptionWhereInput = {
        groupInkindId,
        ...(search && {
          OR: [
            { beneficiaryWallet: { contains: search, mode: 'insensitive' } },
            {
              beneficiary: {
                extras: {
                  path: ['name'],
                  string_contains: search,
                },
              },
            },
            {
              beneficiary: {
                extras: {
                  path: ['phone'],
                  string_contains: search,
                },
              },
            },
          ],
        }),
      };

      const allowedSortFields = ['redeemedAt', 'quantity'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'redeemedAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const orderBy: Prisma.BeneficiaryInkindRedemptionOrderByWithRelationInput =
        {
          [safeSort]: safeOrder,
        };

      const query: Prisma.BeneficiaryInkindRedemptionFindManyArgs = {
        where,
        orderBy,
        include: {
          beneficiary: {
            select: {
              uuid: true,
              walletAddress: true,
              phone: true,
              extras: true,
            },
          },
          Vendor: {
            select: {
              uuid: true,
              name: true,
              walletAddress: true,
            },
          },
        },
      };

      const result = await paginate(
        this.prisma.beneficiaryInkindRedemption,
        query,
        { page, perPage }
      );

      const formattedLogs = result.data.map((redemption: any) => ({
        uuid: redemption.uuid,
        quantity: redemption.quantity,
        redeemedAt: redemption.redeemedAt,
        txHash: redemption.txHash,
        beneficiary: {
          uuid: redemption.beneficiary.uuid,
          walletAddress: redemption.beneficiary.walletAddress,
          phone: redemption.beneficiary.phone,
          name:
            (redemption.beneficiary.extras as Record<string, unknown>)?.name ||
            null,
        },
        vendor: redemption.Vendor
          ? {
              uuid: redemption.Vendor.uuid,
              name: redemption.Vendor.name,
              walletAddress: redemption.Vendor.walletAddress,
            }
          : null,
      }));

      return {
        data: {
          groupInkind: {
            uuid: groupInkind.uuid,
            inkindName: groupInkind.inkind.name,
            inkindType: groupInkind.inkind.type,
            groupName: groupInkind.group.name,
            quantityAllocated: groupInkind.quantityAllocated,
            quantityRedeemed: groupInkind.quantityRedeemed,
            totalBeneficiaries: groupInkind.group._count.beneficiaries,
          },
          logs: formattedLogs,
        },
        meta: result.meta,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch logs for groupInkindId ${groupInkindId}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async sendBeneficiaryOtp(number: string) {
    this.logger.log(`Sending OTP to beneficiary phone number: ${number}`);
    if (!number) {
      throw new RpcException('Missing phone number');
    }
    const benf = await this.prisma.beneficiary.findFirst({
      where: {
        extras: { path: ['phone'], equals: number },
      },
    });
    if (!benf) {
      throw new RpcException('Beneficiary not found');
    }

    const { otp } = await this.otpService.sendSms(
      number,
      'Your OTP for inkind redemption is:'
    );

    const expiry = new Date(Date.now() + 50 * 60 * 1000); // OTP valid for 50 minutes
    const hashOpt = await bcrypt.hash(otp, 10);
    await this.prisma.otp.upsert({
      where: { phoneNumber: number },
      update: {
        otpHash: hashOpt,
        expiresAt: expiry,
        amount: 0,
        isVerified: false,
      },
      create: {
        otpHash: hashOpt,
        expiresAt: expiry,
        phoneNumber: number,
        amount: 0,
      },
    });

    return { success: true, message: 'OTP sent successfully' };
  }

  async validateBeneficiaryOtp(number: string, otp: string) {
    this.logger.log(`Validating OTP for beneficiary phone number: ${number}`);
    if (!number || !otp) {
      throw new RpcException('Missing phone number or OTP');
    }

    const otpRecord = await this.prisma.otp.findUnique({
      where: { phoneNumber: number },
    });

    if (!otpRecord) {
      throw new RpcException('OTP record not found');
    }

    if (otpRecord.isVerified) {
      throw new RpcException('OTP already verified');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new RpcException('OTP has expired');
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      throw new RpcException('Invalid OTP');
    }

    await this.prisma.otp.update({
      where: { phoneNumber: number },
      data: { isVerified: true },
    });

    return { success: true, message: 'OTP verified successfully' };
  }

  async beneficiaryInkindRedeem(
    payload: BeneficiaryInkindRedeemDto
  ): Promise<BeneficiaryRedemptionResponse> {
    const { walletAddress, inkinds, user } = payload;

    if (!walletAddress || !inkinds || inkinds.length === 0) {
      throw new RpcException('Missing required fields');
    }

    this.logger.log(
      `Processing inkind redemption for beneficiary: ${walletAddress}`
    );

    try {
      const vendor = await this.prisma.vendor.findFirst({
        where: {
          uuid: user?.uuid,
        },
      });

      if (!vendor) {
        throw new RpcException(
          `User '${user.name}' is not registered as a vendor`
        );
      }

      // ===== STEP 1: Fetch and validate common data =====
      const inkindUuids = inkinds.map((i) => i.uuid);
      const inkindRecords = await this.prisma.inkind.findMany({
        where: { uuid: { in: inkindUuids }, deletedAt: null },
      });

      if (inkinds.length !== inkindRecords.length) {
        throw new RpcException('One or more inkinds not found');
      }

      const beneficiary = await this.prisma.beneficiary.findFirst({
        where: { walletAddress },
      });

      if (!beneficiary) {
        throw new RpcException('Beneficiary not found');
      }

      // ===== STEP 2: Categorize inkinds by type =====
      const inkindRecordMap = new Map<string, InkindRecord>(
        inkindRecords.map((r) => [
          r.uuid,
          { uuid: r.uuid, name: r.name, type: r.type },
        ])
      );

      const preDefinedPayload: Array<{
        uuid: string;
        groupInkindUuid: string;
      }> = [];
      const walkInPayload: Array<{ uuid: string }> = [];

      for (const payloadInkind of inkinds) {
        const inkindRecord = inkindRecordMap.get(payloadInkind.uuid);
        if (!inkindRecord) continue;

        if (inkindRecord.type === InkindType.PRE_DEFINED) {
          if (!payloadInkind.groupInkindUuid) {
            throw new RpcException(
              `Missing groupInkindUuid for PRE_DEFINED inkind: ${inkindRecord.name}`
            );
          }
          preDefinedPayload.push({
            uuid: payloadInkind.uuid,
            groupInkindUuid: payloadInkind.groupInkindUuid,
          });
        } else if (inkindRecord.type === InkindType.WALK_IN) {
          walkInPayload.push({ uuid: payloadInkind.uuid });
        }
      }

      /*
        1. We will have only inkind uuid in case of walk in type.
        2. So we will have figure out, whether there is a group inkind assigned to this walk in inkind or not.
          2.1 - if we don't have group inkind assigned, assume that, for the first time, this walk in inkind is being redeemed, so we will have to create group by ourself.
          before that, need to create group first. group name will be "Walk-in Group - {inkind name}" and then we will assign this walk in inkind to that group with quantity 1.
          then we will assign the beneficiary to that group in transaction while redeeming the inkind. and we will create redemption record and stock movement record with type REDEEM (like PRE_DEFINED).
          2.2 - if there is already group inkind assigned to this walk in inkind, then we will directly assign the beneficiary to that group in transaction while redeeming the inkind.
          and we will create redemption record and stock movement record with type REDEEM (like PRE_DEFINED). we need to run validation incase beneficiary has already redeemed this walk in inkind,
          then we will throw error.
      */
      // ===== STEP 3: Run all validations BEFORE any mutations =====
      const [validatedPreDefined, validatedWalkIn] = await Promise.all([
        this.validatePreDefinedInkinds(
          preDefinedPayload,
          inkindRecordMap,
          beneficiary.uuid,
          walletAddress
        ),
        this.validateWalkInInkinds(
          walkInPayload,
          inkindRecordMap,
          walletAddress
        ),
      ]);

      if (validatedPreDefined.length === 0 && validatedWalkIn.length === 0) {
        return {
          success: true,
          message: 'No inkinds to redeem',
          redemptions: [],
        };
      }

      this.logger.log(
        `Validated: ${validatedPreDefined.length} PRE_DEFINED, ${validatedWalkIn.length} WALK_IN inkinds`
      );

      // ===== STEP 4: Execute all redemptions in a single transaction =====
      const redemptionResults = await this.prisma.$transaction(async (tx) => {
        const preDefinedResults = await this.executePreDefinedRedemptions(
          tx,
          validatedPreDefined,
          walletAddress,
          user
        );

        const walkInResults = await this.executeWalkInRedemptions(
          tx,
          validatedWalkIn,
          walletAddress,
          beneficiary.uuid,
          user
        );

        return [...preDefinedResults, ...walkInResults];
      });

      const batchedInkinds = inkinds.map((inkind) => {inkind.uuid});
      
      try{
        this.contractQueue.add(JOBS.EVM.REDEEM_INKIND, { beneficiaryAddress: walletAddress,vendorAddress: user.wallet,inkinds: batchedInkinds,  },{
          attempts: 3,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
           },
        })
      } catch(error){
        this.logger.error(
          `Failed to enqueue contract job for inkind redemption: ${error.message}`,
          error.stack
        );
      }

      this.logger.log(
        `Successfully redeemed ${redemptionResults.length} inkinds for beneficiary: ${walletAddress}`
      );

      return {
        message: 'Inkinds redeemed successfully',
        redemptions: redemptionResults,
      };
    } catch (error) {
      this.logger.error(
        `Failed to redeem inkinds for beneficiary: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async updateRedeemInkindTxHash(
    inkindUuid: string[],
    txHash: string,
    beneficiaryWallet: string
  ){
    try {
      this.logger.log(
        `Updating redemption txHash for beneficiary: ${beneficiaryWallet}, inkindUuids: ${inkindUuid.join(', ')}`
      );

      await this.prisma.beneficiaryInkindRedemption.updateMany({
        where: {
          beneficiaryWallet,
          groupInkind: {
            inkindId: { in: inkindUuid },
          }
        },
        data: { txHash, status: InkindTxStatus.COMPLETED },
      });

      this.logger.log(
        `Successfully updated txHash for redemptions of beneficiary: ${beneficiaryWallet}`
      );

      return { success: true, message: 'Redemption txHash updated successfully' };
    }
    catch (error) {
      this.logger.error(
        `Failed to update redemption txHash for beneficiary: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }


  // ==================== VALIDATION HELPERS ====================
  private async validatePreDefinedInkinds(
    preDefinedPayload: Array<{ uuid: string; groupInkindUuid: string }>,
    inkindRecordMap: Map<string, InkindRecord>,
    beneficiaryUuid: string,
    walletAddress: string
  ): Promise<PreDefinedRedemptionItem[]> {
    if (preDefinedPayload.length === 0) return [];

    const groupInkindUuids = preDefinedPayload.map((i) => i.groupInkindUuid);

    // Fetch group inkinds with member counts
    const groupInkinds = await this.prisma.groupInkind.findMany({
      where: { uuid: { in: groupInkindUuids } },
      include: {
        group: {
          include: {
            beneficiaries: {
              where: { beneficiaryId: beneficiaryUuid },
            },
            _count: { select: { beneficiaries: true } },
          },
        },
      },
    });

    if (groupInkinds.length !== groupInkindUuids.length) {
      throw new RpcException('One or more PRE_DEFINED group inkinds not found');
    }

    // Validate beneficiary membership
    for (const groupInkind of groupInkinds) {
      if (groupInkind.group.beneficiaries.length === 0) {
        const inkindRecord = inkindRecordMap.get(groupInkind.inkindId);
        throw new RpcException(
          `Beneficiary is not a member of group for inkind: ${
            inkindRecord?.name || groupInkind.inkindId
          }`
        );
      }
    }

    // Check for existing redemptions
    const existingRedemptions =
      await this.prisma.beneficiaryInkindRedemption.findMany({
        where: {
          beneficiaryWallet: walletAddress,
          groupInkindId: { in: groupInkindUuids },
        },
        include: { groupInkind: { include: { inkind: true } } },
      });

    if (existingRedemptions.length > 0) {
      const alreadyRedeemed = existingRedemptions.map(
        (r) => r.groupInkind.inkind.name
      );
      throw new RpcException(
        `Beneficiary has already redeemed PRE_DEFINED inkinds: ${alreadyRedeemed.join(
          ', '
        )}`
      );
    }

    // Build validated redemption items
    const groupInkindMap = new Map(groupInkinds.map((g) => [g.uuid, g]));

    return preDefinedPayload.map((item) => {
      const groupInkind = groupInkindMap.get(item.groupInkindUuid)!;
      const inkindRecord = inkindRecordMap.get(item.uuid)!;
      const memberCount = groupInkind.group._count.beneficiaries;
      const quantityPerBeneficiary = Math.floor(
        groupInkind.quantityAllocated / memberCount
      );

      if (quantityPerBeneficiary <= 0) {
        throw new RpcException(
          `Invalid quantity allocation for PRE_DEFINED inkind: ${inkindRecord.name}`
        );
      }

      return {
        inkindUuid: item.uuid,
        groupInkindUuid: item.groupInkindUuid,
        inkindName: inkindRecord.name,
        groupInkind: {
          uuid: groupInkind.uuid,
          groupId: groupInkind.groupId,
          quantityAllocated: groupInkind.quantityAllocated,
          memberCount,
        },
      };
    });
  }

  private async validateWalkInInkinds(
    walkInPayload: Array<{ uuid: string }>,
    inkindRecordMap: Map<string, InkindRecord>,
    walletAddress: string
  ): Promise<WalkInRedemptionItem[]> {
    if (walkInPayload.length === 0) return [];

    const walkInUuids = walkInPayload.map((i) => i.uuid);

    // Fetch existing group inkinds for walk-in items
    const existingGroupInkinds = await this.prisma.groupInkind.findMany({
      where: { inkindId: { in: walkInUuids } },
      select: { uuid: true, groupId: true, inkindId: true },
    });

    const groupInkindByInkindId = new Map(
      existingGroupInkinds.map((g) => [g.inkindId, g])
    );

    // Check for existing redemptions for walk-in inkinds that have group assignments
    const existingGroupInkindUuids = existingGroupInkinds.map((g) => g.uuid);

    if (existingGroupInkindUuids.length > 0) {
      const existingRedemptions =
        await this.prisma.beneficiaryInkindRedemption.findMany({
          where: {
            beneficiaryWallet: walletAddress,
            groupInkindId: { in: existingGroupInkindUuids },
          },
          include: { groupInkind: { include: { inkind: true } } },
        });

      if (existingRedemptions.length > 0) {
        const alreadyRedeemed = existingRedemptions.map(
          (r) => r.groupInkind.inkind.name
        );
        throw new RpcException(
          `Beneficiary has already redeemed WALK_IN inkinds: ${alreadyRedeemed.join(
            ', '
          )}`
        );
      }
    }

    // Build validated redemption items
    return walkInPayload.map((item) => {
      const inkindRecord = inkindRecordMap.get(item.uuid)!;
      const existingGroupInkind = groupInkindByInkindId.get(item.uuid) || null;

      return {
        inkindUuid: item.uuid,
        inkindName: inkindRecord.name,
        existingGroupInkind: existingGroupInkind
          ? {
              uuid: existingGroupInkind.uuid,
              groupId: existingGroupInkind.groupId,
            }
          : null,
      };
    });
  }

  // ==================== REDEMPTION EXECUTORS ====================
  private async executePreDefinedRedemptions(
    tx: Prisma.TransactionClient,
    items: PreDefinedRedemptionItem[],
    walletAddress: string,
    vendor: UserObject
  ): Promise<PreDefinedRedemptionResult[]> {
    const results: PreDefinedRedemptionResult[] = [];

    for (const item of items) {
      const quantityPerBeneficiary = Math.floor(
        item.groupInkind.quantityAllocated / item.groupInkind.memberCount
      );

      // Create redemption record
      const redemption = await tx.beneficiaryInkindRedemption.create({
        data: {
          beneficiaryWallet: walletAddress,
          groupInkindId: item.groupInkindUuid,
          quantity: quantityPerBeneficiary,
          vendorUid: vendor.uuid,
          status: InkindTxStatus.PENDING,
        },
      });

      // Create stock movement record with type REDEEM
      await tx.inkindStockMovement.create({
        data: {
          inkindId: item.inkindUuid,
          quantity: quantityPerBeneficiary,
          type: InkindStockMovementType.REDEEM,
          groupInkindId: item.groupInkindUuid,
          redemptionId: redemption.uuid,
        },
      });

      results.push({
        type: InkindType.PRE_DEFINED,
        inkindUuid: item.inkindUuid,
        inkindName: item.inkindName,
        groupInkindUuid: item.groupInkindUuid,
        quantityRedeemed: quantityPerBeneficiary,
        redemptionId: redemption.uuid,
      });
    }

    return results;
  }

  private async executeWalkInRedemptions(
    tx: Prisma.TransactionClient,
    items: WalkInRedemptionItem[],
    walletAddress: string,
    beneficiaryUuid: string,
    vendor: UserObject
  ): Promise<WalkInRedemptionResult[]> {
    const results: WalkInRedemptionResult[] = [];

    for (const item of items) {
      let groupInkindUuid: string;
      let groupId: string;

      if (item.existingGroupInkind) {
        // Group inkind already exists - just add beneficiary to group and redeem
        groupInkindUuid = item.existingGroupInkind.uuid;
        groupId = item.existingGroupInkind.groupId;

        // Check if beneficiary is already in the group
        const existingMembership = await tx.beneficiaryToGroup.findFirst({
          where: { beneficiaryId: beneficiaryUuid, groupId },
        });

        if (!existingMembership) {
          // Sync with CORE to add beneficiary to group
          const res = await this.assignBeneficiariesToGroup(groupId, [
            beneficiaryUuid,
          ]);
          if (!res || !res.success) {
            throw new RpcException(
              'Failed to assign beneficiary to existing walk-in group'
            );
          }

          // Add beneficiary to the walk-in group
          await tx.beneficiaryToGroup.create({
            data: { beneficiaryId: beneficiaryUuid, groupId },
          });
        }

        // Update groupInkind quantityAllocated by 1 (for this new redemption)
        await tx.groupInkind.update({
          where: { uuid: groupInkindUuid },
          data: { quantityAllocated: { increment: 1 } },
        });

        // Create LOCK stock movement for the additional allocation
        await tx.inkindStockMovement.create({
          data: {
            inkindId: item.inkindUuid,
            quantity: 1,
            type: InkindStockMovementType.LOCK,
            groupInkindId: groupInkindUuid,
          },
        });
      } else {
        // First time redemption - create group, group inkind, and add beneficiary
        const groupName = `Walk-in Group - ${item.inkindName}`;

        const res = await this.createGroupAndAssignBeneficiary(groupName, [
          beneficiaryUuid,
        ]);

        if (!res) {
          throw new RpcException(
            'Failed to create group and assign beneficiary for walk-in redemption'
          );
        }

        groupId = res.group.uuid;

        // Create group inkind with quantity 1
        const newGroupInkind = await tx.groupInkind.create({
          data: {
            groupId,
            inkindId: item.inkindUuid,
            quantityAllocated: 1,
          },
        });
        groupInkindUuid = newGroupInkind.uuid;

        // Create LOCK stock movement for the allocation
        await tx.inkindStockMovement.create({
          data: {
            inkindId: item.inkindUuid,
            quantity: 1,
            type: InkindStockMovementType.LOCK,
            groupInkindId: groupInkindUuid,
          },
        });
      }

      // Create redemption record
      const redemption = await tx.beneficiaryInkindRedemption.create({
        data: {
          beneficiaryWallet: walletAddress,
          groupInkindId: groupInkindUuid,
          quantity: 1,
          vendorUid: vendor.uuid,
          status: InkindTxStatus.PENDING,
        },
      });

      // Create stock movement record with type REDEEM
      await tx.inkindStockMovement.create({
        data: {
          inkindId: item.inkindUuid,
          quantity: 1,
          type: InkindStockMovementType.REDEEM,
          groupInkindId: groupInkindUuid,
          redemptionId: redemption.uuid,
        },
      });

      results.push({
        type: InkindType.WALK_IN,
        inkindUuid: item.inkindUuid,
        inkindName: item.inkindName,
        groupInkindUuid,
        quantityRedeemed: 1,
        redemptionId: redemption.uuid,
        isNewGroup: !item.existingGroupInkind,
      });
    }

    return results;
  }

  /**
   * Creates a new group in CORE and assigns beneficiaries to it.
   * Used for WALK_IN inkind first-time redemptions.
   */
  private async createGroupAndAssignBeneficiary(
    groupName: string,
    beneficiaryUuids: string[]
  ): Promise<CreateGroupResponse | null> {
    const projectId = this.configService.get('PROJECT_ID');
    const payload: CreateGroupPayload = {
      name: groupName,
      beneficiaries: beneficiaryUuids.map((uuid) => ({ uuid })),
      groupPurpose: 'MOBILE_MONEY',
      projectId: process.env.PROJECT_ID,
    };

    try {
      const response = await lastValueFrom(
        this.client.send<CreateGroupResponse>(
          { cmd: 'rahat.jobs.beneficiary.add_group' },
          payload
        )
      );
      return response;
    } catch (error) {
      this.logger.error(
        'Error creating group and assigning beneficiaries via CORE:',
        error
      );
      return null;
    }
  }

  /**
   * Assigns beneficiaries to an existing group in CORE.
   * Used when a WALK_IN group already exists.
   */
  private async assignBeneficiariesToGroup(
    groupUuid: string,
    beneficiaryUuids: string[]
  ): Promise<AssignBeneficiariesResponse | null> {
    const payload: AssignBeneficiariesPayload = {
      groupUuid,
      beneficiaries: beneficiaryUuids.map((uuid) => ({ uuid })),
    };

    try {
      const response = await lastValueFrom(
        this.client.send<AssignBeneficiariesResponse>(
          { cmd: 'rahat.jobs.beneficiary.add_beneficiaries_to_group' },
          payload
        )
      );
      return response;
    } catch (error) {
      this.logger.error(
        'Error assigning beneficiaries to group via CORE:',
        error
      );
      return null;
    }
  }
}
