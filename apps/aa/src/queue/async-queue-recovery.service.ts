import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { AsyncQueueService } from './async-queue.service';

@Injectable()
export class AsyncQueueRecoveryService {
  private readonly logger = new Logger(AsyncQueueRecoveryService.name);
  private readonly registry = new Map<string, Queue>();

  constructor(private readonly asyncQueueService: AsyncQueueService) {}

  register(jobName: string, queue: Queue) {
    this.registry.set(jobName, queue);
  }

  async recoverAll() {
    for (const [jobName, queue] of this.registry) {
      const failedRows = await this.asyncQueueService.findFailed(jobName);

      for (const row of failedRows) {
        await this.asyncQueueService.resetToPending(row.uuid);
        await queue.add(
          jobName,
          { ...(row.jobTypeData as Record<string, any>), _asyncJobId: row.uuid },
          {
            attempts: row.maxRetries,
            removeOnComplete: true,
            removeOnFail: false,
            backoff: { type: 'exponential', delay: 1000 },
          }
        );
      }

      if (failedRows.length > 0) {
        this.logger.log(`Recovered ${failedRows.length} failed jobs for ${jobName}`);
      }
    }
  }
}
