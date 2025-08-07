import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { PhasesService } from '../phases/phases.service';
import { PhasesStatsService } from '../phases/phases.stats.service';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';

@Injectable()
export class StatsProcessor implements OnApplicationBootstrap {
  constructor(
    private readonly phasesStatsService: PhasesStatsService,
    private readonly benefStats: BeneficiaryStatService,
    private readonly stakeholderStats: StakeholdersService,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  async onApplicationBootstrap() {
    this.phasesStatsService.calculatePhaseActivities();
    this.benefStats.saveAllStats();
    this.stakeholderStats.stakeholdersCount();
  }

  @OnEvent(EVENTS.PHASE_ACTIVATED)
  async onPhaseTriggered(eventObject) {
    this.phasesStatsService.savePhaseActivatedStats(eventObject.phaseId);
    return;
  }

  @OnEvent(EVENTS.PHASE_REVERTED)
  async onPhaseReverted(eventObject) {
    this.phasesStatsService.savePhaseRevertStats(eventObject);
    return;
  }

  // this also has phase status in it
  @OnEvent(EVENTS.ACTIVITY_COMPLETED)
  @OnEvent(EVENTS.ACTIVITY_DELETED)
  @OnEvent(EVENTS.ACTIVITY_ADDED)
  @OnEvent(EVENTS.PHASE_REVERTED)
  @OnEvent(EVENTS.PHASE_ACTIVATED)
  async onActivityCompleted() {
    this.phasesStatsService.calculatePhaseActivities();
    return;
  }

  @OnEvent(EVENTS.TOKEN_DISBURSED)
  async onTokenDisbursed(groupUuid) {
    this.beneficiaryService.benTokensUpdate(groupUuid);
  }
}
