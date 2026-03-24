import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { InkindStockMovementType, Prisma } from '@prisma/client';
import {
  CreateInkindDto,
  UpdateInkindDto,
  ListInkindDto,
  InkindType,
} from './dto/inkind.dto';
import { AddInkindStockDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';

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

    try {
      const groups = await this.prisma.groupInkind.findMany({
        where: {
          group: {
            beneficiaries: {
              some: {
                beneficiary: {
                  uuid: beneficiary.uuid,
                },
              },
            },
          },
          redemptions: {
            none: {
              beneficiaryWallet: beneficiary.walletAddress,
            },
          },
        },
        select: {
          uuid: true,
          quantityAllocated: true,
          inkind: {
            select: {
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
                      uuid: beneficiary.uuid,
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

      const formattedGroups = groups.map((group) => {
        const memberCount = group.group._count.beneficiaries;
        return {
          groupInkindId: group.uuid,
          quantityAllocated: group.quantityAllocated / memberCount,
          inkindName: group.inkind.name,
          inkindType: group.inkind.type,
          groupId: group.group.uuid,
        };
      });

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
}
