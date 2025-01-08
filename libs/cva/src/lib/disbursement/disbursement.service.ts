import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateDisbursementDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

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

  async listWithPii(query: PaginationBaseDto) {
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

  async findOne(uuid: string) {
    return this.rsprisma.disbursement.findUnique({
      where: { uuid },
    });
  }
}
