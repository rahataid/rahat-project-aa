import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { PaginationBaseDto } from '../dtos/common';
import {
  CreateOfflineBeneficiaryDto,
  GetOfflineBeneficiaryDto,
} from '../dtos/offline-beneficiary';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaOfflineBeneficiaryService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateOfflineBeneficiaryDto) {
    return this.rsprisma.offlineBeneficiary.create({
      data: {
        ...dto,
      },
    });
  }

  async findOne(payload: GetOfflineBeneficiaryDto) {
    const { uuid } = payload;
    return this.rsprisma.offlineBeneficiary.findUnique({
      where: { uuid },
    });
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.offlineBeneficiary,
      {
        where: conditions,
      },
      {
        page,
        perPage,
      }
    );
  }
}
