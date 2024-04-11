import { Process, Processor } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Job } from 'bull';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { AddSchedule } from '../dto';
import { DhmService } from '../datasource/dhm.service';
import { GlofasService } from '../datasource/glofas.service';

@Processor(BQUEUE.SCHEDULE)
export class ScheduleProcessor {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    private readonly bipadService: DhmService,
    private readonly glofasService: GlofasService
  ) { }

  @Process(JOBS.SCHEDULE.ADD)
  async processAddSchedule(job: Job<AddSchedule>) {
    switch (job.data.dataSource) {
      case DATA_SOURCES.DHM:
        await this.bipadService.criteriaCheck(job.data);
        break;
      // case DATA_SOURCES.GLOFAS:
      //   await this.glofasService.criteriaCheck(job.data);
      //   break;
      default:
        // do nothing
    }
  }
}
