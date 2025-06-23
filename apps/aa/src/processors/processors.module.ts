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
import { OfframpProcessor } from './offramp.processor';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';
import { ReceiveService, TransactionService } from '@rahataid/stellar-sdk';
import { CheckTrustlineProcessor } from './checkTrutline.processor';
import { PayoutsModule } from '../payouts/payouts.module';
import { SettingsService } from '@rumsan/settings';
import { OfframpService } from '../payouts/offramp.service';
import { AppModule } from '../app/app.module';

@Module({
  imports: [
    StellarModule,
    DataSourceModule,
    PhasesModule,
    BeneficiaryModule,
    ActivitiesModule,
    PayoutsModule,
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
    BullModule.registerQueue({
      name: BQUEUE.OFFRAMP,
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
    OfframpProcessor,
    {
      provide: ReceiveService,
      useFactory: async (settingsService: SettingsService) => {
        const stellarSettings = await settingsService.getPublic(
          'STELLAR_SETTINGS'
        );
        return new ReceiveService(
          (stellarSettings.value as any).ASSETISSUER,
          (stellarSettings.value as any).ASSETCODE,
          (stellarSettings.value as any).NETWORK,
          (stellarSettings.value as any).FAUCETSECRETKEY,
          (stellarSettings.value as any).FUNDINGAMOUNT
        );
      },
      inject: [SettingsService],
    },
  ],
})
export class ProcessorsModule {}
