import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { PhasesService } from '../phases/phases.service';
import { PhasesStatsService } from '../phases/phases.stats.service';

@Injectable()
export class StatsProcessor {
  constructor(
    private readonly phasesStatsService: PhasesStatsService
  ) { }

  @OnEvent(EVENTS.PHASE_ACTIVATED)
  async onPhaseTriggered(eventObject) {
    this.phasesStatsService.savePhaseActivatedStats(eventObject.phaseId)
    return
  }

  @OnEvent(EVENTS.PHASE_REVERTED)
  async onPhaseReverted(eventObject) {
    this.phasesStatsService.savePhaseRevertStats(eventObject)
    return
  }

}
