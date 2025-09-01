import { Module } from '@nestjs/common';
import { ListernersService } from './listeners.service';
import { StatsService } from '../stats';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, TRIGGGERS_MODULE } from '../constants';
import { CvaDisbursementService } from '@rahat-project/cva';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BQUEUE.SCHEDULE,
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
  ],
  providers: [
    ListernersService,
    StatsService,
    BeneficiaryStatService,
    CvaDisbursementService,
  ],
})
export class ListenersModule {}
