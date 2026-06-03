import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  InkindStockMovementType,
  PayoutMode,
  Prisma,
  RedemptionStatus,
} from '@prisma/client';
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
  RedeemOfflineInkindByVendorDto,
} from './dto/inkind.dto';
import {
  AddInkindStockDto,
  ListStockMovementsDto,
  RemoveInkindStockDto,
} from './dto/inkindStock.dto';
import {
  AssignGroupInkindDto,
  ListGroupInkindDto,
} from './dto/inkindGroup.dto';
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
import { randomUUID } from 'crypto';
import { BQUEUE, CHAIN_SERVICE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { ChainService } from '../chain/chain.service';
import { AppService } from '../app/app.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  AddVendorInkindRedeemDto,
  GetVendorInkindRedemptionDto,
  UpdateVendorInkindRedeemStatusDto,
} from './dto/vendorInkindRedem.dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });
const DEFAULT_BULK_BATCH_SIZE = parseInt(process.env.INKIND_BULK_BATCH_SIZE || '100', 10);

@Injectable()
export class InkindsService {
  private readonly logger = new Logger(InkindsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly appService: AppService,
    private configService: ConfigService,
    @Inject(CHAIN_SERVICE)
    private readonly chainService: ChainService,
    // @InjectQueue(BQUEUE.EVM) private readonly contractQueue: Queue,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    @InjectQueue(BQUEUE.COMMUNICATION)
    private readonly communicationQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(BQUEUE.INKIND_BULK_REDEEM)
    private readonly inkindBulkQueue: Queue
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
        totalAvailableStock: summary._sum.availableStock,
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
    const { inkindId, groupId, quantity, user, mode, payoutProcessorId } =
      payload;
    const projectDetails = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });
    const projectId = this.configService.get('PROJECT_ID');

    const newQuantity = quantity || 1;

    this.logger.log(
      `Assigning group inkind: inkindId=${inkindId}, groupId=${groupId}, quantity=${newQuantity} mode=${mode} payoutProcessorId=${payoutProcessorId}`
    );

    if (!inkindId || !groupId || !mode) {
      throw new RpcException('Missing required fields');
    }

    if (!(mode in PayoutMode)) {
      throw new RpcException('Invalid payout mode');
    }

    if (mode === PayoutMode.OFFLINE && !payoutProcessorId) {
      throw new RpcException(
        'payoutProcessorId is required for offline payouts'
      );
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

    const group = await this.prisma.beneficiaryGroups.findUnique({
      where: { uuid: groupId },
      include: { beneficiaries: true },
    });

    if (!group) {
      throw new RpcException(`Group not found.`);
    }

    const numberOfGroupBeneficiaries = group.beneficiaries.length;

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
            mode,
            payoutProcessorId,
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

      // if mode if offline then we have so send default opt to all users using queue
      if (mode === PayoutMode.OFFLINE) {
        const beneficiaries = await this.prisma.beneficiaryToGroup.findMany({
          where: {
            groupId,
          },
          include: {
            beneficiary: true,
          },
        });

        for (const { beneficiary } of beneficiaries) {
          const phone = (beneficiary.extras as Record<string, unknown>)?.phone;
          if (!phone) {
            continue;
          }

          await this.communicationQueue.add(
            JOBS.INKINDS.SEND_BENEFICIARY_OTP_ON_QUEUE,
            {
              phone,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            }
          );
        }
      }

      this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
        payload: {
          title: `Inkind assigned to group`,
          description: `${inkind.name} inkind has been assigned by ${
            user?.name || 'system'
          } in project ${
            projectDetails.value['project_name'] || projectId
          } to group "${
            group.name
          }" with ${numberOfGroupBeneficiaries} beneficiaries (${newQuantity} unit${
            newQuantity !== 1 ? 's' : ''
          } each, ${totalNeedInkindQuantity} total) via ${mode} redeem`,
          group: 'Inkind Assignment',
          projectId: projectId,
          notify: true,
        },
      });

      return { success: true, message: 'Group inkind assigned successfully' };
    } catch (error) {
      this.logger.error(
        `Failed to assign group inkind: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getByGroup(payload: ListGroupInkindDto) {
    const { page, perPage, order = 'desc', mode, inkindType, search } = payload;

    const where: Prisma.GroupInkindWhereInput = {
      ...(mode && { mode }),
      ...((inkindType || search) && {
        inkind: {
          ...(inkindType && { type: inkindType }),
          ...(search && { name: { contains: search, mode: 'insensitive' } }),
        },
      }),
    };

    try {
      this.logger.log(`Fetching inkinds by group`);

      const result = await paginate(
        this.prisma.groupInkind,
        {
          where,
          orderBy: { createdAt: order },
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
        },
        { page, perPage }
      );

      if (mode === PayoutMode.OFFLINE) {
        this.logger.log(`Fetching vendor details for offline group inkinds`);

        const vendorIds = (result.data as any[])
          .map((g) => g.payoutProcessorId)
          .filter((id) => id !== null);

        const vendors = await this.prisma.vendor.findMany({
          where: { uuid: { in: vendorIds } },
          select: { uuid: true, name: true },
        });

        result.data = (result.data as any[]).map((groupInkind) => {
          const vendor = vendors.find(
            (v) => v.uuid === groupInkind.payoutProcessorId
          );
          return vendor ? { ...groupInkind, vendor: vendor.name } : groupInkind;
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkinds by group: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getAvailableInkindByBeneficiary(
    number?: string,
    walletAddress?: string
  ) {
    this.logger.log(
      `Fetching available inkind details for beneficiary: ${
        number || walletAddress
      }`
    );

    if (!number && !walletAddress) {
      throw new RpcException(
        'Beneficiary phone number or wallet address is required'
      );
    }

    try {
      const beneficiary = await this.prisma.beneficiary.findFirst({
        where: walletAddress
          ? { walletAddress }
          : {
              extras: {
                path: ['phone'],
                equals: String(number),
              },
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
          mode: PayoutMode.ONLINE,
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

  async getInkindLogsDetailsByVendor(payload: GetVendorInkindLogsDto) {
    const {
      vendorId,
      search,
      inkindType,
      page,
      perPage,
      sort = 'redeemedAt',
      order = 'desc',
    } = payload;

    this.logger.log(
      `Fetching inkind redemption logs details for vendor: ${vendorId}`
    );

    if (!vendorId) {
      throw new RpcException('vendorId is required');
    }

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
        beneficiaryWallet: { contains: search, mode: 'insensitive' },
      }),
      ...(inkindType && {
        groupInkind: {
          inkind: {
            type: inkindType,
          },
        },
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

    try {
      const result = await paginate(
        this.prisma.beneficiaryInkindRedemption,
        query,
        { page, perPage }
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkind redemption logs details for vendor: ${error.message}`,
        error.stack
      );
      throw new RpcException('Failed to fetch inkind redemption logs details');
    }
  }

  async getLogsByGroupInkindForVendor(payload: GetVendorInkindLogsDto) {
    const {
      vendorId,
      search,
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

      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

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

       // distinct transactions, not raw records (N records share one txHash).
      const [groupedLogs, allGroups] = await Promise.all([
        this.prisma.beneficiaryInkindRedemption.groupBy({
          by: ['txHash', 'beneficiaryWallet'],
          where,
          _min: { redeemedAt: true },
          orderBy: { _min: { redeemedAt: safeOrder } },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        this.prisma.beneficiaryInkindRedemption.groupBy({
          by: ['txHash', 'beneficiaryWallet'],
          where,
        }),
      ]);

      const totalGroups = allGroups.length;
      const totalPages = Math.ceil(totalGroups / perPage);

      // Fetch phone for each wallet on this page only
      const wallets = [...new Set(groupedLogs.map((g) => g.beneficiaryWallet))];
      const beneficiaryPhones = wallets.length
        ? await this.prisma.beneficiary.findMany({
            where: { walletAddress: { in: wallets } },
            select: { walletAddress: true, extras: true },
          })
        : [];

      const phoneMap = new Map(
        beneficiaryPhones.map((b) => [
          b.walletAddress,
          ((b.extras as Record<string, unknown>)?.phone as string) || null,
        ])
      );

      const formattedLogs = groupedLogs.map((g) => ({
        txHash: g.txHash ?? null,
        date: g._min.redeemedAt,
        phone: phoneMap.get(g.beneficiaryWallet) ?? null,
      }));

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
        meta: {
          total: totalGroups,
          currentPage: page,
          perPage,
          lastPage: totalPages,
          prev: page > 1 ? page - 1 : null,
          next: page < totalPages ? page + 1 : null,
        },
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
      getEntireLogs = false,
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
                extras: { path: ['name'], string_contains: search },
              },
            },
            {
              beneficiary: {
                extras: { path: ['phone'], string_contains: search },
              },
            },
          ],
        }),
      };

      // Whitelist sort fields to prevent injection via Prisma's orderBy
      const allowedSortFields = ['redeemedAt', 'quantity'];
      const safeSort = allowedSortFields.includes(sort) ? sort : 'redeemedAt';
      const safeOrder: Prisma.SortOrder = order === 'asc' ? 'asc' : 'desc';

      const query: Prisma.BeneficiaryInkindRedemptionFindManyArgs = {
        where,
        orderBy: { [safeSort]: safeOrder },
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

      const groupInkindSummary = {
        uuid: groupInkind.uuid,
        inkindName: groupInkind.inkind.name,
        inkindType: groupInkind.inkind.type,
        groupName: groupInkind.group.name,
        quantityAllocated: groupInkind.quantityAllocated,
        quantityRedeemed: groupInkind.quantityRedeemed,
        totalBeneficiaries: groupInkind.group._count.beneficiaries,
      };

      if (getEntireLogs) {
        // Warn: unbounded query — ensure this is only used for exports/trusted callers
        const redemptions =
          await this.prisma.beneficiaryInkindRedemption.findMany(query);

        return {
          data: {
            groupInkind: groupInkindSummary,
            logs: redemptions.map(this.formatRedemption),
          },
          meta: {
            total: redemptions.length,
            page: 1,
            perPage: redemptions.length,
            totalPages: redemptions.length > 0 ? 1 : 0,
          },
        };
      }

      const result = await paginate(
        this.prisma.beneficiaryInkindRedemption,
        query,
        { page, perPage }
      );

      return {
        data: {
          groupInkind: groupInkindSummary,
          logs: result.data.map(this.formatRedemption),
        },
        meta: result.meta,
      };
    } catch (error) {
      // Re-throw RpcExceptions as-is; only wrap unexpected errors
      if (error instanceof RpcException) throw error;
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

    const defaultOpt = await this.prisma.otp.findUnique({
      where: { phoneNumber: number },
    });

    const { otp } = await this.otpService.sendSms(
      number,
      'Your OTP for inkind redemption is:',
      defaultOpt?.otp
    );

    // if otp is set in db and not expired, do not update otp, just resend the existing otp
    if (defaultOpt?.otp) {
      return { success: true, message: 'OTP sent successfully' };
    }

    const expiry = new Date(Date.now() + 50 * 60 * 1000); // OTP valid for 50 minutes
    const hashOpt = await bcrypt.hash(otp, 10);
    await this.prisma.otp.create({
      data: {
        otpHash: hashOpt,
        otp,
        walletAddress: benf.walletAddress,
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

    // if (otpRecord.isVerified) {
    //   throw new RpcException('OTP already verified');
    // }

    // since we send the same opt every time so that this logic is commented out for now.
    // if (otpRecord.expiresAt < new Date()) {
    //   throw new RpcException('OTP has expired');
    // }

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

  private async validateVendorAndPayoutPhase(user: UserObject) {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        uuid: user?.uuid,
      },
    });

    if (!vendor) {
      throw new RpcException(`User '${user.name}' is not registered as a vendor`);
    }

    const { value } = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });

    const isPhasePayoutActivate = await lastValueFrom(
      this.client.send(
        { cmd: 'ms.jobs.phase.getPhasePayoutStatus' },
        {
          activeYear: value.active_year,
          riverBasin: value.river_basin,
        }
      )
    );

    if (!isPhasePayoutActivate) {
      this.logger.log('Payout phase not active. In-kind redemption is unavailable.');
      throw new RpcException('Payout phase not active. In-kind redemption is unavailable.');
    }

    return vendor;
  }

  async beneficiaryInkindRedeem(
    payload: BeneficiaryInkindRedeemDto,
    options?: {
      vendor?: Awaited<ReturnType<InkindsService['validateVendorAndPayoutPhase']>>;
      skipVendorAndPhaseValidation?: boolean;
      preloadedBeneficiary?: { uuid: string; walletAddress: string };
      preloadedInkindRecords?: Array<{ uuid: string; name: string; type: string }>;
    }
  ) {
    const { walletAddress, inkinds, user, redeemedAt } = payload;

    if (!walletAddress || !inkinds || inkinds.length === 0) {
      throw new RpcException('Missing required fields');
    }

    this.logger.log(
      `Processing inkind redemption for beneficiary: ${walletAddress}`
    );

    try {
      const vendor = options?.skipVendorAndPhaseValidation
        ? options.vendor
        : await this.validateVendorAndPayoutPhase(user);

      if (!vendor) {
        throw new RpcException(`User '${user.name}' is not registered as a vendor`);
      }

      // ===== STEP 1: Fetch and validate common data =====
      const inkindUuids = inkinds.map((i) => i.uuid);
      let inkindRecords = options?.preloadedInkindRecords ?? [];

      if (inkindRecords.length !== inkinds.length) {
        inkindRecords = await this.prisma.inkind.findMany({
          where: { uuid: { in: inkindUuids }, deletedAt: null },
        });
      }

      if (inkinds.length !== inkindRecords.length) {
        throw new RpcException('One or more inkinds not found');
      }

      const beneficiary =
        options?.preloadedBeneficiary ??
        (await this.prisma.beneficiary.findFirst({
          where: { walletAddress },
          select: { uuid: true, walletAddress: true },
        }));

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
            groupInkindUuid: payloadInkind.groupInkindUuid
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

      const redeemedAtDate = redeemedAt ? new Date(redeemedAt) : undefined;

      // ===== STEP 4: Execute all redemptions in a single transaction =====
      const redemptionResults = await this.prisma.$transaction(async (tx) => {
        const preDefinedResults = await this.executePreDefinedRedemptions(
          tx,
          validatedPreDefined,
          walletAddress,
          user,
          redeemedAtDate
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

      const batchedInkinds = inkinds.map((inkind) => inkind.uuid);

      try {
        this.logger.log(
          `Enqueuing contract job for inkind redemption: beneficiary=${walletAddress}, vendor=${
            user.wallet
          }, inkinds=${batchedInkinds.join(', ')}`
        );
        this.chainService.redeemInkind({
          beneficiaryAddress: walletAddress,
          vendorAddress: user.wallet,
          inkinds: batchedInkinds,
        });
      } catch (error) {
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
  ) {
    try {
      this.logger.log(
        `Updating redemption txHash for beneficiary: ${beneficiaryWallet}, inkindUuids: ${inkindUuid.join(
          ', '
        )}`
      );

      await this.prisma.beneficiaryInkindRedemption.updateMany({
        where: {
          beneficiaryWallet,
          groupInkind: {
            inkindId: { in: inkindUuid },
          },
        },
        data: { txHash, status: InkindTxStatus.COMPLETED },
      });

      this.logger.log(
        `Successfully updated txHash for redemptions of beneficiary: ${beneficiaryWallet}`
      );

      return {
        success: true,
        message: 'Redemption txHash updated successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to update redemption txHash for beneficiary: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getBeneficiaryInkindDetails(payload: {
    beneficiaryUuid?: string;
    walletAddress?: string;
  }) {
    const { beneficiaryUuid, walletAddress } = payload || {};

    this.logger.log(
      `Fetching assigned, redeemed, and available inkind details for beneficiary: uuid=${
        beneficiaryUuid || 'N/A'
      }, wallet=${walletAddress || 'N/A'}`
    );

    try {
      if (!beneficiaryUuid && !walletAddress) {
        throw new RpcException(
          'Either beneficiaryUuid or walletAddress is required'
        );
      }

      const beneficiary = await this.prisma.beneficiary.findFirst({
        where: {
          ...(beneficiaryUuid && { uuid: beneficiaryUuid }),
          ...(walletAddress && { walletAddress }),
        },
        select: {
          uuid: true,
          walletAddress: true,
          phone: true,
          extras: true,
        },
      });

      if (!beneficiary) {
        throw new RpcException('Beneficiary not found');
      }

      const [groupInkinds, redemptions, walkInInkinds] = await Promise.all([
        this.prisma.groupInkind.findMany({
          where: {
            group: {
              beneficiaries: {
                some: {
                  beneficiaryId: beneficiary.uuid,
                },
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
                _count: {
                  select: {
                    beneficiaries: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.beneficiaryInkindRedemption.findMany({
          where: {
            beneficiaryWallet: beneficiary.walletAddress,
          },
          select: {
            quantity: true,
            groupInkind: {
              select: {
                inkind: {
                  select: {
                    uuid: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.inkind.findMany({
          where: {
            type: InkindType.WALK_IN,
            availableStock: { gt: 0 },
            deletedAt: null,
          },
          select: {
            uuid: true,
            name: true,
            type: true,
            availableStock: true,
          },
        }),
      ]);

      type InkindDetailRow = {
        inkindUuid: string;
        inkindName: string;
        inkindType: string;
        assignedAmount?: number;
        redeemedAmount: number;
        availableAmount: number;
        status: 'REDEEMED' | 'PARTIALLY_REDEEMED' | 'AVAILABLE';
      };

      const inkindMap = new Map<string, InkindDetailRow>();

      const getOrInit = (
        inkindUuid: string,
        inkindName: string,
        inkindType: string
      ) => {
        const existing = inkindMap.get(inkindUuid);
        if (existing) return existing;

        const created: InkindDetailRow = {
          inkindUuid,
          inkindName,
          inkindType,
          assignedAmount: 0,
          redeemedAmount: 0,
          availableAmount: 0,
          status: 'AVAILABLE',
        };
        inkindMap.set(inkindUuid, created);
        return created;
      };

      for (const groupInkind of groupInkinds) {
        const memberCount = groupInkind.group._count.beneficiaries;
        if (!memberCount) continue;

        const quantityPerBeneficiary = Math.floor(
          groupInkind.quantityAllocated / memberCount
        );

        const row = getOrInit(
          groupInkind.inkind.uuid,
          groupInkind.inkind.name,
          groupInkind.inkind.type
        );
        row.assignedAmount = (row.assignedAmount || 0) + quantityPerBeneficiary;
      }

      const redeemedWalkInSet = new Set<string>();

      for (const redemption of redemptions) {
        const row = getOrInit(
          redemption.groupInkind.inkind.uuid,
          redemption.groupInkind.inkind.name,
          redemption.groupInkind.inkind.type
        );
        row.redeemedAmount += redemption.quantity;

        if (redemption.groupInkind.inkind.type === InkindType.WALK_IN) {
          redeemedWalkInSet.add(redemption.groupInkind.inkind.uuid);
        }
      }

      for (const row of inkindMap.values()) {
        row.availableAmount = Math.max(
          (row.assignedAmount || 0) - row.redeemedAmount,
          0
        );
      }

      for (const item of walkInInkinds) {
        if (redeemedWalkInSet.has(item.uuid)) continue;
        const row = getOrInit(item.uuid, item.name, item.type);
        // For walk-in items, keep allocated availability when present; otherwise expose one-time availability when stock exists.
        row.availableAmount = Math.max(row.availableAmount, 1);
      }

      for (const row of inkindMap.values()) {
        if (row.inkindType === InkindType.WALK_IN) {
          delete row.assignedAmount;
        }

        if (row.availableAmount <= 0 && row.redeemedAmount > 0) {
          row.status = 'REDEEMED';
        } else if (row.redeemedAmount > 0 && row.availableAmount > 0) {
          row.status = 'PARTIALLY_REDEEMED';
        } else {
          row.status = 'AVAILABLE';
        }
      }

      const inkinds = Array.from(inkindMap.values());

      return {
        inkinds,
        summary: {
          totalAssigned: inkinds.reduce(
            (sum, i) => sum + (i.assignedAmount || 0),
            0
          ),
          totalRedeemed: inkinds.reduce((sum, i) => sum + i.redeemedAmount, 0),
          totalAvailable: inkinds.reduce(
            (sum, i) => sum + i.availableAmount,
            0
          ),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch beneficiary inkind details: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getAllOfflineBeneficiaryByVendor(vendorId: string) {
    this.logger.log(
      `Fetching all predefined offline beneficiaries for vendor: ${vendorId}`
    );

    if (!vendorId) {
      throw new RpcException('vendorUid is required');
    }

    try {
      // fetch all OFFLINE group inkinds assigned to this vendor, with their beneficiaries and inkind details
      const offlineGroupInkinds = await this.prisma.groupInkind.findMany({
        where: {
          payoutProcessorId: vendorId,
          mode: PayoutMode.OFFLINE,
        },
        select: {
          uuid: true,
          inkind: {
            select: {
              uuid: true,
              name: true,
            },
          },
          group: {
            select: {
              beneficiaries: {
                select: {
                  beneficiary: {
                    select: {
                      uuid: true,
                      walletAddress: true,
                      extras: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (offlineGroupInkinds.length === 0) {
        return { beneficiaries: [] };
      }

      // one entry per beneficiary; inkinds from multiple groups are merged into one list
      const beneficiaryMap = new Map<
        string,
        {
          uuid: string;
          walletAddress: string;
          phone: string | null;
          otpHash?: string | null;
          inkinds: { id: string; name: string; groupInkindId: string }[];
        }
      >();

      // walk groups → beneficiaries → inkinds; skip duplicate inkind per beneficiary
      for (const gi of offlineGroupInkinds) {
        const inkindInfo = {
          id: gi.inkind.uuid,
          name: gi.inkind.name,
          groupInkindId: gi.uuid,
        };

        for (const b of gi.group.beneficiaries) {
          const ben = b.beneficiary;
          const existing = beneficiaryMap.get(ben.uuid);

          if (existing) {
            if (!existing.inkinds.some((i) => i.id === inkindInfo.id)) {
              existing.inkinds.push(inkindInfo);
            }
          } else {
            beneficiaryMap.set(ben.uuid, {
              uuid: ben.uuid,
              walletAddress: ben.walletAddress,
              phone:
                typeof ben.extras === 'object' && ben.extras !== null
                  ? (ben.extras as any).phone
                  : null,
              inkinds: [inkindInfo],
            });
          }
        }
      }

      // flatten map; collect phones, wallets, groupInkindIds for batch queries below
      const beneficiaries = Array.from(beneficiaryMap.values());
      const phones = beneficiaries.map((b) => b.phone).filter(Boolean) as string[];
      const allWallets = beneficiaries.map((b) => b.walletAddress);
      const allGroupInkindIds = beneficiaries.flatMap((b) =>
        b.inkinds.map((i) => i.groupInkindId)
      );

      // parallel: OTPs for offline auth handshake, redemptions to exclude already-done inkinds
      const [otps, existingRedemptions] = await Promise.all([
        phones.length > 0
          ? this.prisma.otp.findMany({
              where: { phoneNumber: { in: phones } },
              select: { phoneNumber: true, otpHash: true },
            })
          : Promise.resolve([]),
        allGroupInkindIds.length > 0
          ? this.prisma.beneficiaryInkindRedemption.findMany({
              where: {
                beneficiaryWallet: { in: allWallets },
                groupInkindId: { in: allGroupInkindIds },
              },
              select: { beneficiaryWallet: true, groupInkindId: true },
            })
          : Promise.resolve([]),
      ]);

      // composite key wallet_groupInkindId for O(1) already-redeemed lookup
      const redeemedSet = new Set(
        existingRedemptions.map((r) => `${r.beneficiaryWallet}_${r.groupInkindId}`)
      );

      // phone → otpHash lookup for attaching to each beneficiary
      const otpMap = new Map<string, string>();
      for (const otp of otps) {
        if (!otpMap.has(otp.phoneNumber)) {
          otpMap.set(otp.phoneNumber, otp.otpHash);
        }
      }

      // attach OTP hash; strip already-redeemed inkinds so vendor only sees pending ones
      for (const b of beneficiaries) {
        b.otpHash = b.phone && otpMap.has(b.phone) ? otpMap.get(b.phone) : null;
        b.inkinds = b.inkinds.filter(
          (i) => !redeemedSet.has(`${b.walletAddress}_${i.groupInkindId}`)
        );
      }

      return { beneficiaries };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch predefined offline beneficiaries for vendor: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async beneficiaryBulkInkindRedeem(
    payloads: BeneficiaryInkindRedeemDto[],
    user: UserObject,
    batchSize = DEFAULT_BULK_BATCH_SIZE
  ) {
    if (!payloads || payloads.length === 0) {
      throw new RpcException('No inkinds provided for redemption');
    }

    this.logger.log(
      `Queuing bulk inkind redemption for vendor: ${user.uuid}, total=${payloads.length}, batchSize=${batchSize}`
    );

    try {
      // guard: vendor must be registered and payout phase must be open
      const vendor = await this.validateVendorAndPayoutPhase(user);

      // split payloads into fixed-size chunks
      const batches: BeneficiaryInkindRedeemDto[][] = [];
      for (let i = 0; i < payloads.length; i += batchSize) {
        batches.push(payloads.slice(i, i + batchSize));
      }

      // persist each batch to DB before enqueuing — if server dies before pickup, onModuleInit replays
      const batchRecords = await Promise.all(
        batches.map((batch) =>
          this.prisma.tempOfflineInkindRedemption.create({
            data: {
              vendorId: vendor.uuid,
              user: user as any,
              vendor: { uuid: vendor.uuid } as any,
              payloads: batch as any,
              status: 'PENDING',
            },
          })
        )
      );

      // jobId = batchRecord.uuid so Bull deduplicates if the same batch is re-queued on restart
      const jobs = await Promise.all(
        batchRecords.map((record, i) =>
          this.inkindBulkQueue.add(
            JOBS.INKINDS.BULK_REDEEM_BATCH,
            { payloads: batches[i], user, vendor: { uuid: vendor.uuid }, batchId: record.uuid },
            { jobId: record.uuid, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
          )
        )
      );

      this.logger.log(`Queued ${batches.length} batch(es) for vendor: ${user.uuid}`);

      // return immediately; processing happens async in the Bull worker
      return {
        message: 'Bulk inkind redemption queued',
        totalPayloads: payloads.length,
        totalBatches: batches.length,
        jobIds: jobs.map((j) => j.id),
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to process bulk inkind redemptions for vendor: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async processBulkBatch(
    payloads: BeneficiaryInkindRedeemDto[],
    user: UserObject,
    vendor: { uuid: string },
    batchId?: string
  ) {
    // mark in-flight so restart recovery knows to re-queue if server dies mid-batch
    if (batchId) {
      await this.prisma.tempOfflineInkindRedemption.update({
        where: { uuid: batchId },
        data: { status: 'PROCESSING' },
      }).catch(() => {});
    }

    try {
      // collect unique IDs across all payloads — one query per entity type below
      const allInkindUuids = Array.from(
        new Set(payloads.flatMap((p) => p.inkinds.map((i) => i.uuid)))
      );
      const allGroupInkindUuids = Array.from(
        new Set(payloads.flatMap((p) => p.inkinds.map((i) => i.groupInkindUuid).filter(Boolean)))
      ) as string[];
      const allBeneficiaryWallets = Array.from(
        new Set(payloads.map((p) => p.walletAddress))
      );

      // 4 parallel DB reads — single round-trip before the write phase
      const [inkindRecords, beneficiaries, groupInkinds, existingRedemptions] = await Promise.all([
        this.prisma.inkind.findMany({
          where: { uuid: { in: allInkindUuids }, deletedAt: null },
          select: { uuid: true, name: true, type: true },
        }),
        this.prisma.beneficiary.findMany({
          where: { walletAddress: { in: allBeneficiaryWallets } },
          select: { uuid: true, walletAddress: true },
        }),
        this.prisma.groupInkind.findMany({
          where: { uuid: { in: allGroupInkindUuids } },
          include: {
            group: {
              include: { _count: { select: { beneficiaries: true } } },
            },
          },
        }),
        this.prisma.beneficiaryInkindRedemption.findMany({
          where: {
            beneficiaryWallet: { in: allBeneficiaryWallets },
            groupInkindId: { in: allGroupInkindUuids },
          },
          select: { beneficiaryWallet: true, groupInkindId: true },
        }),
      ]);

      // uuid-keyed maps replace repeated array.find() in the hot loop below
      const inkindRecordMap = new Map(inkindRecords.map((r) => [r.uuid, r]));
      const beneficiaryMap = new Map(beneficiaries.map((b) => [b.walletAddress, b]));
      const groupInkindMap = new Map(groupInkinds.map((g) => [g.uuid, g]));

      // composite key wallet_groupInkindId — O(1) duplicate check without per-row DB query
      const redeemedSet = new Set(
        existingRedemptions.map((r) => `${r.beneficiaryWallet}_${r.groupInkindId}`)
      );

      // buffers collect valid rows; written in one atomic transaction at the end
      const validRedemptionsToInsert: any[] = [];
      const validStockMovementsToInsert: any[] = [];
      const allBatchedInkindsToQueue: string[] = [];
      const formattedRedemptionResults: any[] = [];
      const skipped: { beneficiaryWallet: string; inkindUuid?: string; reason: string }[] = [];

      // validate each beneficiary+inkind in memory; invalids go to skipped[], valids go to buffers
      for (const payload of payloads) {
        const preloadedBeneficiary = beneficiaryMap.get(payload.walletAddress);

        if (!preloadedBeneficiary) {
          this.logger.warn(`[BULK_REDEEM] Beneficiary ${payload.walletAddress} not found during bulk redeem, skipping.`);
          skipped.push({ beneficiaryWallet: payload.walletAddress, reason: 'Beneficiary not found' });
          continue;
        }

        this.logger.log(`[BULK_REDEEM] Processing beneficiary: ${payload.walletAddress}, inkinds count: ${payload.inkinds.length}`);

        const redeemedAtDate = payload.redeemedAt ? new Date(payload.redeemedAt) : undefined;

        for (const payloadInkind of payload.inkinds) {
          const inkindRecord = inkindRecordMap.get(payloadInkind.uuid);

          if (!inkindRecord) {
            skipped.push({ beneficiaryWallet: payload.walletAddress, inkindUuid: payloadInkind.uuid, reason: 'Inkind not found' });
            continue;
          }
          // WALK_IN is not accepted for OFFLINE redemption
          if (inkindRecord.type !== InkindType.PRE_DEFINED) {
            continue;
          }
          if (!payloadInkind.groupInkindUuid) {
            skipped.push({ beneficiaryWallet: payload.walletAddress, inkindUuid: payloadInkind.uuid, reason: 'Missing groupInkindUuid for PRE_DEFINED inkind' });
            continue;
          }

          const groupInkind = groupInkindMap.get(payloadInkind.groupInkindUuid);
          if (!groupInkind) {
            skipped.push({ beneficiaryWallet: payload.walletAddress, inkindUuid: payloadInkind.uuid, reason: 'Group inkind not found' });
            continue;
          }

          // Check for existing redemption to prevent double-spending
          const redemptionKey = `${payload.walletAddress}_${payloadInkind.groupInkindUuid}`;
          if (redeemedSet.has(redemptionKey)) {
            this.logger.warn(`[BULK_REDEEM] Already redeemed key=${redemptionKey} (inkind: ${inkindRecord.name}), skipping.`);
            skipped.push({ beneficiaryWallet: payload.walletAddress, inkindUuid: payloadInkind.uuid, reason: 'Already redeemed' });
            continue;
          }

          const memberCount = groupInkind.group._count.beneficiaries;
          if (!memberCount) {
            skipped.push({ beneficiaryWallet: payload.walletAddress, inkindUuid: payloadInkind.uuid, reason: 'Group has no members' });
            continue;
          }

          // equal share: total allocated for the group divided by member count
          const quantityPerBeneficiary = Math.floor(
            groupInkind.quantityAllocated / memberCount
          );

          const redemptionId = randomUUID();

          // buffer redemption row — links beneficiary, group, vendor, quantity
          validRedemptionsToInsert.push({
            uuid: redemptionId,
            beneficiaryWallet: payload.walletAddress,
            groupInkindId: payloadInkind.groupInkindUuid,
            quantity: quantityPerBeneficiary,
            vendorUid: vendor.uuid,
            status: InkindTxStatus.PENDING,
            ...(redeemedAtDate ? { redeemedAt: redeemedAtDate } : {}),
          });

          // buffer stock deduction row, back-linked to the redemption by redemptionId
          validStockMovementsToInsert.push({
            uuid: randomUUID(),
            inkindId: payloadInkind.uuid,
            quantity: quantityPerBeneficiary,
            type: InkindStockMovementType.REDEEM,
            groupInkindId: payloadInkind.groupInkindUuid,
            redemptionId: redemptionId,
          });

          allBatchedInkindsToQueue.push(payloadInkind.uuid);

          formattedRedemptionResults.push({
            type: InkindType.PRE_DEFINED,
            inkindUuid: payloadInkind.uuid,
            inkindName: inkindRecord.name,
            groupInkindUuid: payloadInkind.groupInkindUuid,
            quantityRedeemed: quantityPerBeneficiary,
            redemptionId: redemptionId,
          });
        }
      }

      if (validRedemptionsToInsert.length === 0) {
        if (batchId) {
          await this.prisma.tempOfflineInkindRedemption.delete({ where: { uuid: batchId } }).catch(() => {});
        }
        return {
          message: 'No valid predefined bulk inkinds found to redeem',
          redemptions: [],
          skipped,
        };
      }

      // STEP 6: Persist all valid rows in one DB transaction.
      await this.prisma.$transaction([
        this.prisma.beneficiaryInkindRedemption.createMany({ data: validRedemptionsToInsert }),
        this.prisma.inkindStockMovement.createMany({ data: validStockMovementsToInsert }),
      ]);

      try {
        // STEP 7: Dispatch smart contract transactions by wallet to queue.
        this.logger.log(
          `Enqueuing bulk contract job for ${allBatchedInkindsToQueue.length} inkinds total.`
        );
        const inkindsByWallet: Record<string, string[]> = {};
        for (let i = 0; i < validRedemptionsToInsert.length; i++) {
          const wallet = validRedemptionsToInsert[i].beneficiaryWallet;
          const inkindUuid = formattedRedemptionResults[i].inkindUuid;
          if (!inkindsByWallet[wallet]) inkindsByWallet[wallet] = [];
          inkindsByWallet[wallet].push(inkindUuid);
        }

        for (const [wallet, inkinds] of Object.entries(inkindsByWallet)) {
          if (inkinds.length > 0) {
            this.chainService.redeemInkind({
              beneficiaryAddress: wallet,
              vendorAddress: user.wallet,
              inkinds: inkinds,
            });
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to enqueue contract job for bulk inkind redemption: ${error.message}`,
          error.stack
        );
      }

      this.logger.log(
        `Successfully processed bulk inkind batch for vendor: ${vendor.uuid}. Inserted ${validRedemptionsToInsert.length} redemptions.`
      );

      if (batchId) {
        await this.prisma.tempOfflineInkindRedemption.delete({ where: { uuid: batchId } }).catch(() => {});
      }

      return {
        message: 'Bulk inkinds redeemed successfully',
        redemptions: formattedRedemptionResults,
        skipped,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to process bulk inkind batch for vendor: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async redeemOfflineInkindByVendor(payload: RedeemOfflineInkindByVendorDto) {
    const { redeemedInkinds, user } = payload;

    this.logger.log(
      `Processing offline inkind redemption for vendor: ${user.uuid}`
    );

    if (!user || !user.uuid) {
      throw new RpcException('userUuid is required');
    }

    if (!redeemedInkinds || redeemedInkinds.length === 0) {
      throw new RpcException('No inkinds provided for redemption');
    }

    try {
      const bulkPayloads: BeneficiaryInkindRedeemDto[] = redeemedInkinds.map((item) => {
        return {
          walletAddress: item.beneficiaryWallet,
          user,
          redeemedAt: item.redeemedAt,
          inkinds: item.inkindRedeemed.map((inkind) => ({
            uuid: inkind.uuid,
            groupInkindUuid: inkind.groupInkindUuid,
          })),
        };
      });

      return await this.beneficiaryBulkInkindRedeem(bulkPayloads, user);
    } catch (error: any) {
      this.logger.error(
        `Failed to redeem offline inkinds for vendor: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  // ====================  VENDOR REDEMPTION ====================

  async getVendorAvailableInkindsDetails(vendorUuid: string) {
    this.logger.log(
      `Fetching total earned inkinds details for vendor: ${vendorUuid}`
    );

    if (!vendorUuid) {
      throw new RpcException('vendorUuid is required');
    }

    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorUuid },
        select: { uuid: true, name: true, walletAddress: true },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${vendorUuid} not found`);
      }

      // Total earned per inkind: what the vendor collected from beneficiaries
      const beneficiaryRedemptionGroups =
        await this.prisma.beneficiaryInkindRedemption.groupBy({
          by: ['groupInkindId'],
          where: { vendorUid: vendorUuid },
          _sum: { quantity: true },
        });

      if (beneficiaryRedemptionGroups.length === 0) {
        return {
          vendor: {
            uuid: vendor.uuid,
            name: vendor.name,
            walletAddress: vendor.walletAddress,
          },
          inkinds: [],
        };
      }

      // Resolve groupInkindId -> inkindUuid
      const groupInkindIds = beneficiaryRedemptionGroups.map(
        (g) => g.groupInkindId
      );
      const groupInkinds = await this.prisma.groupInkind.findMany({
        where: { uuid: { in: groupInkindIds } },
        select: {
          uuid: true,
          inkindId: true,
          inkind: { select: { uuid: true, name: true, type: true } },
        },
      });

      const groupInkindMap = new Map(groupInkinds.map((g) => [g.uuid, g]));

      // Aggregate earned quantity per inkind uuid
      const earnedByInkind = new Map<string, number>();
      for (const group of beneficiaryRedemptionGroups) {
        const groupInkind = groupInkindMap.get(group.groupInkindId);
        if (!groupInkind) continue;
        const inkindUuid = groupInkind.inkindId;
        earnedByInkind.set(
          inkindUuid,
          (earnedByInkind.get(inkindUuid) ?? 0) + (group._sum.quantity ?? 0)
        );
      }

      // Total consumed per inkind: approved redemptions + pending requests
      const vendorRedemptionGroups =
        await this.prisma.vendorInkindRedemption.groupBy({
          by: ['inkindUuid'],
          where: {
            vendorUuid,
            redemptionStatus: {
              in: [RedemptionStatus.APPROVED, RedemptionStatus.REQUESTED],
            },
          },
          _sum: { quantity: true },
        });

      const paidByInkind = new Map<string, number>(
        vendorRedemptionGroups.map((g) => [g.inkindUuid, g._sum.quantity ?? 0])
      );

      // Build per-inkind summary using inkind details resolved above
      const inkindDetailMap = new Map(
        groupInkinds.map((g) => [g.inkindId, g.inkind])
      );

      const inkinds = Array.from(earnedByInkind.entries())
        .map(([inkindUuid, totalEarned]) => {
          const inkind = inkindDetailMap.get(inkindUuid);
          const totalPaidOut = paidByInkind.get(inkindUuid) ?? 0;
          return {
            inkindUuid,
            inkindName: inkind?.name,
            inkindType: inkind?.type,
            totalAvailable: Math.max(totalEarned - totalPaidOut, 0),
          };
        })
        .filter((item) => item.totalAvailable > 0);

      return {
        vendor: {
          uuid: vendor.uuid,
          name: vendor.name,
          walletAddress: vendor.walletAddress,
        },
        inkinds,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch total earned inkinds for vendor ${vendorUuid}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getVendorRedemptions(payload: GetVendorInkindRedemptionDto) {
    const { vendorUuid, status, vendorName, inkindName, page, perPage } = payload;
    this.logger.log(
      `Fetching all vendor redemptions with filters: ${JSON.stringify(payload)}`
    );

    if (vendorUuid) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorUuid },
        select: { uuid: true, name: true },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${vendorUuid} not found`);
      }
    }

    try {
      const query: Prisma.VendorInkindRedemptionFindManyArgs = {
        where: {
          ...(vendorUuid && { vendorUuid }),
          ...(status && { redemptionStatus: status }),
          ...(vendorName && {
            vendor: { name: { contains: vendorName, mode: 'insensitive' } },
          }),
          ...(inkindName && {
            inkind: { name: { contains: inkindName, mode: 'insensitive' } },
          }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          inkind: {
            select: {
              uuid: true,
              name: true,
              type: true,
            },
          },
          vendor: {
            select: {
              uuid: true,
              name: true,
            },
          },
        },
      };

      const result = await paginate(this.prisma.vendorInkindRedemption, query, {
        page,
        perPage,
      });

      if (result.data.length === 0) {
        this.logger.log(
          `No vendor redemptions found with filters: ${JSON.stringify(payload)}`
        );

        return [];
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to fetch vendor redemptions with filters ${JSON.stringify(
          payload
        )}: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async createVendorRedemption(payload: AddVendorInkindRedeemDto) {
    const { vendorUuid, inkindUuid, quantity  } = payload;
    this.logger.log(
      `Creating inkind redemption for vendor: ${vendorUuid}, inkind: ${inkindUuid}, quantity: ${quantity}`
    );

    const projectDetails = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });
    const projectId = this.configService.get('PROJECT_ID');

    if (!vendorUuid || !inkindUuid || !quantity) {
      throw new RpcException('Missing required fields');
    }

    if (quantity <= 0) {
      throw new RpcException('Quantity must be greater than zero');
    }

    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with UUID ${vendorUuid} not found`);
      }

      const inkind = await this.prisma.inkind.findUnique({
        where: { uuid: inkindUuid },
      });

      if (!inkind) {
        throw new RpcException(`Inkind with UUID ${inkindUuid} not found`);
      }

      const existingRedemption = await this.prisma.vendorInkindRedemption.findFirst({
        where: {
          vendorUuid,
          inkindUuid,
          redemptionStatus: RedemptionStatus.REQUESTED,
        },
      });

      if (existingRedemption) {
        throw new RpcException(
          `A pending redemption already exists for this vendor and inkind`
        );
      }

      const redemption = await this.prisma.vendorInkindRedemption.create({
        data: {
          vendorUuid,
          inkindUuid, 
          quantity,
        },
      });

      this.logger.log(
        `Successfully created vendor redemption with ID: ${redemption.id}`
      );

      // sending notification to vendor about redemption creation
      this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
        payload: {
          title: `Vendor Inkind Redemption Created`,
          description: `Vendor "${vendor.name}" has requested a redemption of ${quantity} unit${quantity !== 1 ? 's' : ''} of "${inkind.name}" in project ${projectDetails.value['project_name'] || projectId}`,
          group: 'vendor inkind redemption',
          projectId: projectId,
          notify: true,
        },
      });

      return {
        success: true,
        message: 'Vendor redemption created successfully',
        redemptionUuid: redemption.uuid,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create vendor redemption: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async updateVendorRedemptionStatus(
    payload: UpdateVendorInkindRedeemStatusDto
  ) {
    const { uuid, status, user } = payload;
    this.logger.log(
      `Updating vendor redemption status: redemptionUuid=${uuid}, newStatus=${status}`
    );

    if (!uuid || !status) {
      throw new RpcException('Missing required fields');
    }

    try {
      const redemption = await this.prisma.vendorInkindRedemption.findUnique({
        where: { uuid },
      });

      
      if (!redemption) {
        throw new RpcException(`Vendor redemption with UUID ${uuid} not found`);
      }
      
      const vendorDetails = await this.prisma.vendor.findUnique({
        where: { uuid: redemption?.vendorUuid },
      });

      if (!vendorDetails) {
        throw new RpcException(`Vendor with UUID ${redemption.vendorUuid} not found`);
      }
      // now we have to create tx hash of this redemption and update the redemption record with that tx hash

      await this.prisma.vendorInkindRedemption.update({
        where: { uuid },
        data: {
          redemptionStatus: status,

          ...(status === RedemptionStatus.APPROVED && {
            approvedAt: new Date(),
            approvedBy: user.name,
          }),
        },
      });

      this.logger.log(
        `Vendor redemption status updated to ${status} for redemption UUID: ${uuid}`
      );

      // this.logger.log(
      //   `Enqueuing contract job to redeem vendor inkind tokens for redemption UUID: ${uuid}`
      // )

      // this.chainService.redeemVendorInkindTokens({
      //   redemptionUuid: uuid,
      //   vendorWallet: vendorDetails.walletAddress,
      //   quantity: redemption.quantity,
      // });
      
      this.logger.log(
        `Successfully updated vendor redemption status for redemption UUID: ${uuid}`
      );

      return {
        success: true,
        message: 'Vendor redemption status updated successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to update vendor redemption status: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async updateVendorRedemptionTxHash(
    redemptionUuid: string,
    txHash: string
  ) {
    this.logger.log(
      `Updating vendor redemption txHash: redemptionUuid=${redemptionUuid}`
    );

    if (!redemptionUuid || !txHash) {
      throw new RpcException('Missing required fields');
    }

    try {
      await this.prisma.vendorInkindRedemption.update({
        where: { uuid: redemptionUuid },
        data: { transactionHash: txHash },
      });

      this.logger.log(
        `Successfully updated txHash for vendor redemption: ${redemptionUuid}`
      );

      return {
        success: true,
        message: 'Vendor redemption txHash updated successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to update vendor redemption txHash: ${error.message}`,
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
    vendor: UserObject,
    redeemedAt?: Date 
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
          ...(redeemedAt !== undefined ? { redeemedAt } : {}),
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

  private formatRedemption(redemption: any) {
    return {
      uuid: redemption.uuid,
      quantity: redemption.quantity,
      redeemedAt: redemption.redeemedAt,
      txHash: redemption.txHash,
      beneficiary: {
        uuid: redemption.beneficiary.uuid,
        walletAddress: redemption.beneficiary.walletAddress,
        phone: redemption.beneficiary.phone,
        name:
          (redemption.beneficiary.extras as Record<string, unknown>)?.name ??
          null,
      },
      vendor: redemption.Vendor
        ? {
            uuid: redemption.Vendor.uuid,
            name: redemption.Vendor.name,
            walletAddress: redemption.Vendor.walletAddress,
          }
        : null,
    };
  }
}
