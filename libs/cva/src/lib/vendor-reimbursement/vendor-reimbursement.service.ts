import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import {
  CreateVendorReimbursementDto,
  GetVendorReimbursementDto,
} from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaVendorReimbursementService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateVendorReimbursementDto) {
    return this.rsprisma.vendorReimbursment.create({
      data: {
        tokenAddress: dto.tokenAddress,
        voucherAmount: dto.voucherAmount,
        vendorUid: dto.vendorId,
        status: dto.status,
      },
    });
  }

  async findOne(payload: GetVendorReimbursementDto) {
    const { uuid } = payload;
    return this.rsprisma.vendorReimbursment.findUnique({
      where: { uuid },
    });
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.vendorReimbursment,
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
