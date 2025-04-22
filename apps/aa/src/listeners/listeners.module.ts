import { Module } from '@nestjs/common';
import { ListernersService } from './listeners.service';
import { StatsService } from '../stats';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { CvaDisbursementService } from '@rahat-project/cva';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BQUEUE.SCHEDULE,
    }),
  ],
  providers: [
    ListernersService,
    StatsService,
    BeneficiaryStatService,
    CvaDisbursementService,
  ],
})
export class ListenersModule {}
