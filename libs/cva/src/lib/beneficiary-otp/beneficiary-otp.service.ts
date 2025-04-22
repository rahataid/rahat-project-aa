import { Injectable } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CreateBeneficiaryOtpDto, GetBeneficiaryOtpDto } from '../dtos';

@Injectable()
export class CvaBeneficiaryOtpService {
  public rsprisma: typeof this.prisma.rsclient;

  constructor(private prisma: PrismaService) {
    this.rsprisma = prisma.rsclient;
  }

  async create(dto: CreateBeneficiaryOtpDto) {
    return this.rsprisma.beneficiaryOTP.create({
      data: dto,
    });
  }

  async findOne(payload: GetBeneficiaryOtpDto) {
    const { uuid } = payload;
    return this.rsprisma.beneficiaryOTP.findUnique({
      where: { uuid },
    });
  }
}
