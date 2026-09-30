import { Injectable } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { Queue, JobOptions } from 'bull';

interface EnqueueInput {
  jobName: string;
  queue: Queue;
  jobTypeData: Record<string, any>;
  metadata?: Record<string, any>;
  attempts?: number;
  backoff?: JobOptions['backoff'];
}

@Injectable()
export class AsyncQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueInput): Promise<{ uuid: string }> {
    const { jobName, queue, jobTypeData, metadata, attempts = 3, backoff } = input;

    const row = await this.prisma.asyncQueueJob.create({
      data: {
        jobName,
        status: 'PENDING',
        jobTypeData,
        metadata,
        maxRetries: attempts,
      },
    });

    await queue.add(
      jobName,
      { ...jobTypeData, _asyncJobId: row.uuid },
      {
        attempts,
        removeOnComplete: true,
        removeOnFail: false,
        backoff: backoff ?? { type: 'exponential', delay: 1000 },
      }
    );

    return { uuid: row.uuid };
  }

  /** Returns false when the tracking row is gone (job was cancelled/cleaned up). */
  async markProcessing(uuid: string): Promise<boolean> {
    const { count } = await this.prisma.asyncQueueJob.updateMany({
      where: { uuid },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });
    return count > 0;
  }

  async complete(uuid: string) {
    await this.prisma.asyncQueueJob.deleteMany({ where: { uuid } });
  }

  async fail(uuid: string, error: string) {
    await this.prisma.asyncQueueJob.update({
      where: { uuid },
      data: {
        status: 'FAILED',
        error,
        failedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });
  }

  async findFailed(jobName: string) {
    return this.prisma.asyncQueueJob.findMany({
      where: { jobName, status: 'FAILED' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resetToPending(uuid: string) {
    await this.prisma.asyncQueueJob.update({
      where: { uuid },
      data: { status: 'PENDING' },
    });
  }
}
