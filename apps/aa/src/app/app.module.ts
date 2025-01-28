import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RahatCvaModule } from '@rahat-project/cva';
import { SettingsModule } from '@rumsan/settings';
import { ActivityCategoriesModule } from '../activity-categories/activity-categories.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { DailyMonitoringModule } from '../daily-monitoring/daily-monitoring.module';
import { DataSourceModule } from '../datasource/datasource.module';
import { DepositModule } from '../deposit/deposit.module';
import { DisbursementModule } from '../disbursement/disbursement.modue';
import { ListenersModule } from '../listeners/listeners.module';
import { PhasesModule } from '../phases/phases.module';
import { ProcessorsModule } from '../processors/processors.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { StatsModule } from '../stats';
import { TriggersModule } from '../triggers/triggers.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommsModule } from '../comms/comms.module';
import { ActivitiesModule } from '../activities/activites.module';

@Module({
  imports: [
    RahatCvaModule.registerDefaultModules(),
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ maxListeners: 10, ignoreErrors: false }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    DisbursementModule,
    DepositModule,
    TriggersModule,
    DataSourceModule,
    ProcessorsModule,
    ActivitiesModule,
    PhasesModule,
    ActivityCategoriesModule,
    BeneficiaryModule,
    StakeholdersModule,
    SettingsModule,
    ScheduleModule.forRoot(),
    StatsModule,
    DailyMonitoringModule,
    ListenersModule,
    CommsModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
