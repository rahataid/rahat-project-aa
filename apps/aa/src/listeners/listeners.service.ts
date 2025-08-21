import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { BeneficiaryStatService } from '../beneficiary/beneficiaryStat.service';
import { OnEvent } from '@nestjs/event-emitter';
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CVA_EVENTS, CvaDisbursementService } from '@rahat-project/cva';
import { StakeholdersService } from '../stakeholders/stakeholders.service';

@Injectable()
export class ListernersService {
  private readonly logger = new Logger(ListernersService.name);

  constructor(
    private readonly aaStats: BeneficiaryStatService,
    private readonly stakeholderStats: StakeholdersService,
    @InjectQueue(BQUEUE.SCHEDULE) private readonly scheduleQueue: Queue,
    @InjectQueue(BQUEUE.NOTIFICATION) private readonly notificationQueue: Queue,
    @Inject(forwardRef(() => CvaDisbursementService))
    private disbService: CvaDisbursementService
  ) {}

  @OnEvent(EVENTS.BENEFICIARY_CREATED)
  @OnEvent(EVENTS.BENEFICIARY_REMOVED)
  @OnEvent(EVENTS.BENEFICIARY_UPDATED)
  @OnEvent(EVENTS.TOKEN_RESERVED)
  async onBeneficiaryChanged() {
    await this.aaStats.saveAllStats();
  }
  @OnEvent(EVENTS.STAKEHOLDER_CREATED)
  @OnEvent(EVENTS.STAKEHOLDER_REMOVED)
  @OnEvent(EVENTS.STAKEHOLDER_UPDATED)
  @OnEvent(EVENTS.TOKEN_RESERVED)
  async onstakeholderChanged() {
    await this.stakeholderStats.stakeholdersCount();
  }
  @OnEvent(EVENTS.AUTOMATED_TRIGGERED)
  async handleAutomatedTrigger(payload: { repeatKey: string }) {
    const allJobs = await this.scheduleQueue.getRepeatableJobs();
    const targetJob = allJobs.find((j) => j.key === payload.repeatKey);
    await this.scheduleQueue.removeRepeatableByKey(targetJob.key);
    this.logger.log('Triggered automated job removed.');
    return;
  }

  @OnEvent(CVA_EVENTS.DISBURSEMENT.INITIATED)
  async disburseBenefTokens(payload: {
    amount: number;
    walletAddress: string;
  }) {
    console.log('Disbursing tokens:', payload);
    return this.disbService.create(payload);
  }

  @OnEvent(EVENTS.NOTIFICATION.CREATE)
  async handleNotification(event: { payload: any }) {
    console.log(event);
    const { payload } = event;
    try {
      this.logger.log(`✅ Notification event emitted`);

      this.notificationQueue.add(JOBS.NOTIFICATION.CREATE, payload, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(`✅ Notification job queued`);
    } catch (error) {
      console.error('❌ Notification emit failed:', error);
      throw error;
    }
  }
}
