import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { AddSchedule } from '../dto';
import { BipadService } from '../datasource/bipad.service';

@Processor(BQUEUE.SCHEDULE)
export class ScheduleProcessor {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private readonly bipadService: BipadService
  ) { }

  @Process(JOBS.SCHEDULE.ADD)
  async processAddSchedule(job: Job<AddSchedule>) {    
      this.logger.log(`${job.data.dataSource}: monitoring`)
      await this.bipadService.criteriaCheck(job.data);
  }
}
