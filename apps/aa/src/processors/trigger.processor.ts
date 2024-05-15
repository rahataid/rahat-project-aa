import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, JOBS } from '../constants';
import { DhmService } from '../datasource/dhm.service';

@Processor(BQUEUE.TRIGGER)
export class TriggerProcessor {
  private readonly logger = new Logger(TriggerProcessor.name);

  @Process(JOBS.TRIGGERS.REACHED_THRESHOLD)
  async processReachedThreshold(job: any) {
    console.log(job)
    console.log("Processing after reaching threshold.")
  }
}
