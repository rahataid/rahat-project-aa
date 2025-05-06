import { Module } from '@nestjs/common';
import { ScheduleProcessor } from './schedule.processor';
import { DataSourceModule } from '../datasource/datasource.module';
import { TriggerProcessor } from './trigger.processor';
import { PhasesModule } from '../phases/phases.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { PrismaService } from '@rumsan/prisma';
import { ContractProcessor } from './contract.processor';
import { CommunicationProcessor } from './communication.processor';
import { StatsProcessor } from './stats.processor';
import { ActivitiesModule } from '../activities/activites.module';
import { StellarModule } from '../stellar/stellar.module';
import { StellarProcessor } from './stellar.processor';

@Module({
  imports: [
    DataSourceModule,
    PhasesModule,
    BeneficiaryModule,
    ActivitiesModule,
  ],
  providers: [
    ScheduleProcessor,
    TriggerProcessor,
    PrismaService,
    ContractProcessor,
    CommunicationProcessor,
    StatsProcessor,
    StellarProcessor,
  ],
})
export class ProcessorsModule {}
