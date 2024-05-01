import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ListenersModule } from '../listeners/listeners.module';
import { TriggersModule } from '../triggers/triggers.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ProcessorsModule } from '../processors/processors.module';
import { DataSourceModule } from '../datasource/datasource.module';
import { ActivitiesModule } from '../activities/activites.module';
import { HazardTypesModule } from '../hazard-types/hazard-types.module';
import { PhasesModule } from '../phases/phases.module';
import { ActivityCategoriesModule } from '../activity-categories/activity-categories.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';

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
    ListenersModule,
    DataSourceModule,
    ProcessorsModule,
    ActivitiesModule,
    HazardTypesModule,
    PhasesModule,
    ActivityCategoriesModule,
    BeneficiaryModule,
    StakeholdersModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
