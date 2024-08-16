import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrismaModule } from '@rumsan/prisma';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';

@Module({
  imports: [PrismaModule, StakeholdersModule, BeneficiaryModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule { }
