import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  CreateInkindDto,
  UpdateInkindDto,
  ListInkindDto,
} from './dto/inkind.dto';

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
        where: { name: inkindData.name },
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
              type: 'ADD',
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
      if (error instanceof NotFoundException) throw error;
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
      if (error instanceof NotFoundException) throw error;
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

      const orderBy: Prisma.InkindOrderByWithRelationInput = {
        [sort]: order,
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
}
