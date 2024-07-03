import { Injectable, Logger } from '@nestjs/common';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { OnEvent } from '@nestjs/event-emitter';
import { BQUEUE, EVENTS } from '../constants';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class ListernersService {
  private readonly logger = new Logger(ListernersService.name);

  constructor(
    private readonly aaStats: BeneficiaryStatService,
    @InjectQueue(BQUEUE.SCHEDULE) private readonly scheduleQueue: Queue
  ) {}

  @OnEvent(EVENTS.BENEFICIARY_CREATED)
  @OnEvent(EVENTS.BENEFICIARY_REMOVED)
  @OnEvent(EVENTS.BENEFICIARY_UPDATED)
  @OnEvent(EVENTS.TOKEN_RESERVED)
  async onBeneficiaryChanged() {
    await this.aaStats.saveAllStats();
  }

  @OnEvent(EVENTS.AUTOMATED_TRIGGERED)
  async handleAutomatedTrigger(payload: { repeatKey: string }) {
    const allJobs = await this.scheduleQueue.getRepeatableJobs();
    const targetJob = allJobs.find((j) => j.key === payload.repeatKey);
    await this.scheduleQueue.removeRepeatableByKey(targetJob.key);
    this.logger.log('Triggered automated job removed.');
    return;
  }
}
