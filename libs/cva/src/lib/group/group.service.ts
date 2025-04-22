import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { PaginationBaseDto } from '../dtos/common';
import { CreateGroupDto, GetGroupDto } from '../dtos';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaGroupService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateGroupDto) {
    const row = await this.rsprisma.group.create({
      data: dto,
    });
    return row;
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.group,
      {
        where: conditions,
      },
      {
        page,
        perPage,
      }
    );
  }

  async findOne(dto: GetGroupDto) {
    return this.rsprisma.group.findUnique({
      where: { uuid: dto.uuid },
    });
  }
}
