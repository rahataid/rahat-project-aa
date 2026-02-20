import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '../constants';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { StakeholdersService } from '../stakeholders/stakeholders.service';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';

@Injectable()
export class StatsProcessor implements OnApplicationBootstrap {
  constructor(
    private readonly benefStats: BeneficiaryStatService,
    private readonly stakeholderStats: StakeholdersService,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  async onApplicationBootstrap() {
    this.benefStats.saveAllStats();
    this.stakeholderStats.stakeholdersCount();
  }

  @OnEvent(EVENTS.TOKEN_DISBURSED)
  async onTokenDisbursed(groupUuid) {
    this.beneficiaryService.benTokensUpdate(groupUuid);
  }
}
