import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { AddBeneficiariesToGroupDto, ListBeneficiaryByGroupDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaBeneficiaryGroupService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async addBeneficiariesToGroup(dto: AddBeneficiariesToGroupDto) {
    const { beneficiaries, groupUID } = dto;
    const data = beneficiaries.map((beneficiaryUID) => ({
      beneficiaryUID,
      groupUID,
    }));
    const rows = await this.rsprisma.beneficiaryGroup.createMany({
      data,
      skipDuplicates: true,
    });
    return rows;
  }

  async list(query: PaginationBaseDto) {
    const { page, perPage } = query;
    const conditions = { deletedAt: null };
    return paginate(
      this.prisma.beneficiaryGroup,
      {
        where: conditions,
      },
      {
        page,
        perPage,
      }
    );
  }

  async listBenefByGroup(dto: ListBeneficiaryByGroupDto) {
    const { page, perPage, groupUID } = dto;
    const conditions = { groupUID };

    return paginate(
      this.prisma.beneficiaryGroup,
      {
        where: conditions,
        include: {
          beneficiary: {
            select: {
              uuid: true,
              walletAddress: true,
            },
          },
          group: {
            select: {
              uuid: true,
              name: true,
            },
          },
        },
      },
      {
        page,
        perPage,
      }
    );
  }
}
