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
      case DATA_SOURCES.DHM:
        await this.processDhmData(payload)
      case DATA_SOURCES.MANUAL:
        await this.processManualTrigger(payload)
        break;

      default:
        break;
    }
  }

  async processDhmData(payload) {
    const phaseData = await this.phaseService.getOne({
      uuid: payload.phaseId
    })

    const conditionsMet = this.checkTriggerConditions(phaseData.triggerRequirements)
    if (conditionsMet) {
      this.phaseService.activatePhase(phaseData.uuid)
    }
    return
  }

  async processManualTrigger(payload) {
    const phaseData = await this.phaseService.getOne({
      uuid: payload.phaseId
    })

    const conditionsMet = this.checkTriggerConditions(phaseData.triggerRequirements)
    if (conditionsMet) {
      this.phaseService.activatePhase(phaseData.uuid)
    }
    return
  }

  checkTriggerConditions(triggerRequirements) {
    const { mandatoryTriggers, optionalTriggers } = triggerRequirements;

    const mandatoryMet = mandatoryTriggers.receivedTriggers >= mandatoryTriggers.requiredTriggers;
    const optionalMet = optionalTriggers.receivedTriggers >= optionalTriggers.requiredTriggers;

    return mandatoryMet && optionalMet;
  }
}
