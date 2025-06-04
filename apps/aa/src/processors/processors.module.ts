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
import { StellarProcessor } from './stellar.processor';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { CheckTrustlineProcessor } from './checkTrutline.processor';

@Module({
  imports: [
    StellarModule,
    DataSourceModule,
    PhasesModule,
    BeneficiaryModule,
    ActivitiesModule,
    ClientsModule.register([
      {
        name: CORE_MODULE,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR_CHECK_TRUSTLINE,
    }),
  ],
  providers: [
    ScheduleProcessor,
    TriggerProcessor,
    PrismaService,
    ContractProcessor,
    CommunicationProcessor,
    StatsProcessor,
    StellarProcessor,
    CheckTrustlineProcessor,
    ReceiveService,
  ],
})
export class ProcessorsModule {}
