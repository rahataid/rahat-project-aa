import { Module } from '@nestjs/common';
import { ListernersService } from './listeners.service';
import { StatsService } from '../stats';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, TRIGGGERS_MODULE } from '../constants';
import { CvaDisbursementService } from '@rahat-project/cva';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { SettingsModule } from '@rumsan/settings';
import { ChainModule } from '../chain/chain.module';

@Module({
  imports: [
    SettingsModule,
    BullModule.registerQueue({
      name: BQUEUE.SCHEDULE,
    }),
    BullModule.registerQueue({
      name: BQUEUE.NOTIFICATION,
    }),
    ClientsModule.register([
      {
        name: TRIGGGERS_MODULE,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
    StakeholdersModule,
    SettingsModule,
    ChainModule,
  ],
  providers: [
    ListernersService,
    StatsService,
    BeneficiaryStatService,
    CvaDisbursementService,
  ],
})
export class ListenersModule {}
