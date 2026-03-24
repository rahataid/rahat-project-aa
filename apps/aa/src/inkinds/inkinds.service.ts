import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { InkindStockMovementType, Prisma } from '@prisma/client';
import {
  CreateInkindDto,
  UpdateInkindDto,
  ListInkindDto,
  InkindType,
  RedeemInkindByBeneficiaryDto,
} from './dto/inkind.dto';
import { AddInkindStockDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';
import {
  PreDefinedRedemptionItem,
  WalkInRedemptionItem,
} from './dto/inkind.type';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

@Injectable()
export class InkindsService {
  private readonly logger = new Logger(InkindsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

      return paginate(
        this.prisma.inkind,
        { where, orderBy },
        { page, perPage }
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch inkinds: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getOne(uuid: string) {
    try {
      this.logger.log(`Fetching inkind: ${uuid}`);
      return await this.findOneOrThrow(uuid);
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

  async getAllStockMovements() {
    this.logger.log(`Fetching all inkind stock movements`);
    try {
      return await this.prisma.inkindStockMovement.findMany({
        where: {
          type: {
            not: InkindStockMovementType.REDEEM,
          },
        },
        include: {
          inkind: true,
          groupInkind: true,
          redemption: true,
        },
        orderBy: { createdAt: 'desc' },
      });
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
  async assignGroupInkind(payload: AssignGroupInkindDto) {
    const { inkindId, groupId, quantity } = payload;
    const newQuantity = quantity || 1;

    this.logger.log(
      `Assigning group inkind: inkindId=${inkindId}, groupId=${groupId}, quantity=${newQuantity}`
    );

    if (!inkindId || !groupId) {
      throw new RpcException('Missing required fields');
    }

    const inkind = await this.findOneOrThrow(inkindId);

    const existingAssignment = await this.prisma.groupInkind.findFirst({
      where: { groupId, inkindId },
    });

    if (existingAssignment) {
      throw new RpcException(`Inkind is already assigned to this group.`);
    }

    const availableStock = inkind.availableStock || 0;

    const numberOfGroupBeneficiaries =
      await this.prisma.beneficiaryToGroup.count({
        where: { groupId },
      });

    if (numberOfGroupBeneficiaries === 0) {
      throw new RpcException(`No beneficiaries found in the group.`);
    }

    const totalNeedInkindQuantity = newQuantity * numberOfGroupBeneficiaries;

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

  async getByGroup() {
    try {
      this.logger.log(`Fetching inkinds by group`);
      const groupInkinds = await this.prisma.groupInkind.findMany({
        include: {
          inkind: true,
          group: true,
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

  async redeemInkindByBeneficiary(payload: RedeemInkindByBeneficiaryDto) {
    const { walletAddress, inkinds } = payload;

    if (!walletAddress || !inkinds || inkinds.length === 0) {
      throw new RpcException('Missing required fields');
    }

    this.logger.log(
      `Processing inkind redemption for beneficiary: ${walletAddress}`
    );

    try {
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
      const inkindRecordMap = new Map(
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
          walletAddress
        );

        const walkInResults = await this.executeWalkInRedemptions(
          tx,
          validatedWalkIn,
          walletAddress,
          beneficiary.uuid
        );

        return [...preDefinedResults, ...walkInResults];
      });

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

  // ==================== VALIDATION HELPERS ====================
  private async validatePreDefinedInkinds(
    preDefinedPayload: Array<{ uuid: string; groupInkindUuid: string }>,
    inkindRecordMap: Map<string, { uuid: string; name: string; type: string }>,
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
    inkindRecordMap: Map<string, { uuid: string; name: string; type: string }>,
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
    walletAddress: string
  ) {
    const results = [];

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
    beneficiaryUuid: string
  ) {
    const results = [];

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

        // Create the walk-in group
        const newGroup = await tx.beneficiaryGroups.create({
          data: { name: groupName },
        });
        groupId = newGroup.uuid;

        // Assign beneficiary to the new group
        await tx.beneficiaryToGroup.create({
          data: { beneficiaryId: beneficiaryUuid, groupId },
        });

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
}
