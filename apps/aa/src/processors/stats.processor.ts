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

  @OnEvent(EVENTS.PHASE_TRIGGERED)
  async onPhaseTriggered(eventObject) {
    this.phasesStatsService.saveTriggerStats(eventObject.phaseId)
    return
  }

}
