import { Injectable } from '@nestjs/common';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
import { CreateBeneficiaryGroupDto, ListBeneficiaryByGroupDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class CvaBeneficiaryGroupService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryGroupDto) {
    const row = await this.rsprisma.beneficiaryGroup.create({
      data: dto,
    });
    return row;
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
      },
      {
        page,
        perPage,
      }
    );
  }
}
