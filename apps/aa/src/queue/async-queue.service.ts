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

  async markProcessing(uuid: string) {
    await this.prisma.asyncQueueJob.update({
      where: { uuid },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });
  }

  async complete(uuid: string) {
    await this.prisma.asyncQueueJob.delete({ where: { uuid } });
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
