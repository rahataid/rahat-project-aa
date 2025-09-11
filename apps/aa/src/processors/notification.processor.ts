import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { ClientProxy } from '@nestjs/microservices';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';

const payload = {
  title: `Failed Fund Disbursement`,
  description: `Funds disbursed have been failed in ${process.env.PROJECT_ID} for Rahat group after activation of Activation Phase`,
  group: 'Fund Management',
  notify: true,
};
@Processor(BQUEUE.NOTIFICATION)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(@Inject(CORE_MODULE) private readonly client: ClientProxy) {}

  @Process(JOBS.NOTIFICATION.CREATE)
  async handleNotification(job: Job) {
    const payload = job.data;
    try {
      this.logger.log(`🚀 Processing notification job: ${payload}`);
      const rdata = await lastValueFrom(
        this.client.send({ cmd: 'rahat.jobs.notification.create' }, payload)
      );
      console.log(rdata);
      this.logger.log(`✅ Notification delivered: ${rdata}`);
    } catch (error) {
      this.logger.error(
        `❌ Notification job failed: ${JOBS.NOTIFICATION.CREATE}`,
        error.stack
      );
      throw error;
    }
  }
}
