import { Injectable, Logger } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateBeneficiaryRedeemDto, GetBeneficiaryRedeemDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { Prisma } from '@prisma/client';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaBeneficiaryRedeemService {
  private readonly logger = new Logger(CvaBeneficiaryRedeemService.name);
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryRedeemDto) {
    return this.rsprisma.beneficiaryRedeem.create({
      data: {
        beneficiaryWalletAddress: dto.beneficiaryWalletAddress,
        vendorUid: dto.vendorUid,
        isCompleted: dto.hasRedeemed,
        transactionType: dto.transactionType,
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

  async updateBeneficiaryRedeem(
    uuid: string,
    payload: Prisma.BeneficiaryRedeemUpdateInput
  ) {
    try {
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.update({
        where: { uuid },
        data: payload,
      });

      this.logger.log(`Beneficiary redeem updated: ${beneficiaryRedeem.uuid}`);

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error updating beneficiary redeem: ${error}`);
      throw error;
    }
  }

  async createBeneficiaryRedeem(payload: Prisma.BeneficiaryRedeemCreateInput) {
    try {
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.create({
        data: payload,
      });

      this.logger.log(`Beneficiary redeem created: ${beneficiaryRedeem.uuid}`);

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error creating beneficiary redeem: ${error}`);
      throw error;
    }
  }

  async getBeneficiaryRedeem(uuid: string) {
    try {
      const beneficiaryRedeem = await this.prisma.beneficiaryRedeem.findUnique({
        where: { uuid },
      });

      return beneficiaryRedeem;
    } catch (error) {
      this.logger.error(`Error getting beneficiary redeem: ${error}`);
      throw error;
    }
  }
};