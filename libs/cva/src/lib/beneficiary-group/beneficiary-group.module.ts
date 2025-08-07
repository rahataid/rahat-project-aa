import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CvaBeneficiaryGroupController } from './beneficiary-group.controller';
import { CvaBeneficiaryGroupService } from './beneficiary-group.service';

const PROVIDERS = [CvaBeneficiaryGroupService, PrismaService];

@Module({
  imports: [],
  controllers: [CvaBeneficiaryGroupController],
  providers: [...PROVIDERS],
})
export class CvaBeneficiaryGroupModule {}
