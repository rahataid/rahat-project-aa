import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateDisbursementDto, GetDisbursementDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { Injectable } from '@nestjs/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaDisbursementService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateDisbursementDto) {
    const row = await this.rsprisma.disbursement.create({
      data: dto,
    });
    return row;
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.disbursement,
      {
        where: conditions,
      },
      {
        page,
        perPage,
      }
    );
  }

  async findOne(dto: GetDisbursementDto) {
    return this.rsprisma.disbursement.findUnique({
      where: { uuid: dto.uuid },
    });
  }
}
