import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { PrismaModule } from '@rumsan/prisma';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    BullModule.registerQueue({
      name: BQUEUE.SCHEDULE,
    })
  ],
  providers: [ScheduleService],
  controllers: [ScheduleController],
})
export class ScheduleModule {}
