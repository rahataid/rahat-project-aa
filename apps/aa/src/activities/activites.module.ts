import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { PrismaModule } from '@rumsan/prisma';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';

@Module({
  imports: [PrismaModule, StakeholdersModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
})
export class ActivitiesModule {}
