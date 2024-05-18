import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { DhmService } from '../datasource/dhm.service';
import { Job } from 'bull';
import { PhasesService } from '../phases/phases.service';

@Processor(BQUEUE.TRIGGER)
export class TriggerProcessor {
  private readonly logger = new Logger(TriggerProcessor.name);

  constructor(
    private readonly phaseService: PhasesService
  ) { }

  @Process(JOBS.TRIGGERS.REACHED_THRESHOLD)
  async processTrigger(job: Job) {
    const payload = job.data

    switch (payload.dataSource) {
      case DATA_SOURCES.MANUAL:
        await this.processManualTrigger(payload)
        break;

      default:
        break;
    }
  }

  async processManualTrigger(payload) {
    const phaseData = await this.phaseService.getOne({
      uuid: payload.phaseId
    })

    console.log(phaseData);

    console.log(payload);
  }
}
