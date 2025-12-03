import { BullModule } from '@nestjs/bull';
import { Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { MS_TRIGGER_CLIENTS, RahatCvaModule } from '@rahat-project/cva';
import { SettingsModule } from '@rumsan/settings';
import { ActivitiesModule } from '../activities/activites.module';
import { ActivityCategoriesModule } from '../activity-categories/activity-categories.module';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { CashTrackerModule } from '../cash-tracker';
import { ChainModule } from '../chain/chain.module';
import { CommsModule } from '../comms/comms.module';
import { BQUEUE } from '../constants';
import { DailyMonitoringModule } from '../daily-monitoring/daily-monitoring.module';
import { DataSourceModule } from '../datasource/datasource.module';
import { GrievancesModule } from '../grievances/grievances.module';
import { InkindTrackerModule } from '../inkind-tracker';
import { ListenersModule } from '../listeners/listeners.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PhasesModule } from '../phases/phases.module';
import { ProcessorsModule } from '../processors/processors.module';
import { QueueService } from '../queue/queue.service';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { StatsModule } from '../stats';
import { StellarModule } from '../stellar/stellar.module';
import { TriggersModule } from '../triggers/triggers.module';
import { VendorsModule } from '../vendors/vendors.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
          connectionName: `nestjs-rahat-aa-${
            process.env.PROJECT_ID
          }-${Date.now()}`,
        },
      }),
      inject: [ConfigService],
    }),
    ClientsModule.register([
      {
        name: MS_TRIGGER_CLIENTS.RAHAT,
        transport: Transport.REDIS,
        options: {
          host: process.env['REDIS_HOST'],
          port: process.env['REDIS_PORT']
            ? parseInt(process.env['REDIS_PORT'])
            : 6379,
          password: process.env['REDIS_PASSWORD'],
        },
      },
    ]),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    BullModule.registerQueue({
      name: BQUEUE.OFFRAMP,
    }),
    BullModule.registerQueue({
      name: BQUEUE.VENDOR_CVA,
    }),
    BullModule.registerQueue({
      name: BQUEUE.COMMUNICATION,
    }),
    BullModule.registerQueue({
      name: BQUEUE.TRIGGER,
    }),
    BullModule.registerQueue({
      name: BQUEUE.SCHEDULE,
    }),
    BullModule.registerQueue({
      name: BQUEUE.CONTRACT,
    }),
    BullModule.registerQueue({
      name: BQUEUE.EVM,
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
    VendorsModule,
    PayoutsModule,
    ChainModule,
    CashTrackerModule,
    GrievancesModule,
    InkindTrackerModule,
  ],
  controllers: [AppController],
  providers: [AppService, QueueService],
})
export class AppModule implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly queueService: QueueService) {}

  async onModuleInit() {
    console.log('🚀 Initializing application...');

    await this.queueService.waitForConnection();

    await this.setupProcessors();

    console.log('✅ All queue processors initialized successfully');
  }

  async onModuleDestroy() {
    console.log('🔄 Shutting down queue processors...');
    await this.queueService.closeAllConnections();
    console.log('✅ All queue connections closed');
  }

  private async setupProcessors() {
    try {
      await this.queueService.verifyProcessorsReady();

      console.log('📋 Queue processors verification completed');
    } catch (error) {
      console.error('❌ Failed to setup processors:', error);
      throw error;
    }
  }
}
