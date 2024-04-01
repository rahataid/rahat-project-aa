import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BipadSource } from './datasource';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [HttpModule],
  providers: [ScheduleService, SchedulerRegistry, BipadSource],
  controllers: [ScheduleController],
})
export class ScheduleModule {}
