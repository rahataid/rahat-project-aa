import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { CvaBeneficiaryGroupController } from './beneficiary-group.controller';
import { CvaBeneficiaryGroupService } from './beneficiary-group.service';

const PROVIDERS = [CvaBeneficiaryGroupService];

@Module({
  imports: [PrismaModule],
  controllers: [CvaBeneficiaryGroupController],
  providers: [...PROVIDERS],
})
export class CvaBeneficiaryGroupModule {}
