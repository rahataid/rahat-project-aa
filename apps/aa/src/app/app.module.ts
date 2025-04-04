import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TriggersModule } from '../triggers/triggers.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ProcessorsModule } from '../processors/processors.module';
import { DataSourceModule } from '../datasource/datasource.module';
import { ActivitiesModule } from '../activities/activites.module';
import { PhasesModule } from '../phases/phases.module';
import { ActivityCategoriesModule } from '../activity-categories/activity-categories.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { SettingsModule } from '@rumsan/settings';
import { ScheduleModule } from '@nestjs/schedule';
import { StatsModule } from '../stats';
import { DailyMonitoringModule } from '../daily-monitoring/daily-monitoring.module';
import { ListenersModule } from '../listeners/listeners.module';
import { CommsModule } from '../comms/comms.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
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
    StellarModule,
    DailyMonitoringModule,
    ListenersModule,
    CommsModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
