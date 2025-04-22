import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateBeneficiaryRedeemDto, GetBeneficiaryRedeemDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaBeneficiaryRedeemService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryRedeemDto) {
    return this.rsprisma.beneficiaryRedeem.create({
      data: {
        beneficiaryWalletAddress: dto.beneficiaryWalletAddress,
        vendorUid: dto.vendorId,
        hasRedeemed: dto.hasRedeemed,
      },
    });
  }

  async findOne(payload: GetBeneficiaryRedeemDto) {
    const { uuid } = payload;
    return this.rsprisma.beneficiaryRedeem.findUnique({
      where: { uuid },
    });
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.beneficiaryRedeem,
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
