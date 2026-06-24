import {
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { BQUEUE, JOBS } from '../constants';
import { InkindsService } from './inkinds.service';
import { BeneficiaryInkindRedeemDto, UserObject } from './dto/inkind.dto';

interface BulkRedeemJobData {
  payloads: BeneficiaryInkindRedeemDto[];
  user: UserObject;
  vendor: { uuid: string };
  batchId?: string;
}

@Injectable()
@Processor(BQUEUE.INKIND_BULK_REDEEM)
export class InkindBulkRedeemProcessor implements OnModuleInit {
  private readonly logger = new Logger(InkindBulkRedeemProcessor.name);

  constructor(
    private readonly inkindsService: InkindsService,
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.INKIND_BULK_REDEEM)
    private readonly inkindBulkQueue: Queue
  ) {}

  async onModuleInit() {
    const pending = await this.prisma.tempOfflineInkindRedemption.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
    });

    if (pending.length === 0) return;

    this.logger.log(`[RESTART] Found ${pending.length} unfinished batch(es), re-queuing...`);

    for (const record of pending) {
      try {
        // Bull deduplicates by jobId — safe to call even if already queued
        await this.inkindBulkQueue.add(
          JOBS.INKINDS.BULK_REDEEM_BATCH,
          {
            payloads: record.payloads as unknown as BeneficiaryInkindRedeemDto[],
            user: record.user as unknown as UserObject,
            vendor: record.vendor as { uuid: string },
            batchId: record.uuid,
          },
          {
            jobId: record.uuid,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        );

        await this.prisma.tempOfflineInkindRedemption.update({
          where: { uuid: record.uuid },
          data: { status: 'PENDING' },
        });

        this.logger.log(`[RESTART] Re-queued batch ${record.uuid}`);
      } catch (err: any) {
        this.logger.warn(`[RESTART] Could not re-queue batch ${record.uuid}: ${err?.message}`);
      }
    }
  }

  @Process({ name: JOBS.INKINDS.BULK_REDEEM_BATCH, concurrency: 1 })
  async handle(job: Job<BulkRedeemJobData>) {
    const { payloads, user, vendor, batchId } = job.data;
    this.logger.log(
      `[JOB ${job.id}] Processing bulk redeem batch: ${payloads.length} payloads, vendor=${vendor.uuid}`
    );
    return this.inkindsService.processBulkBatch(payloads, user, vendor, batchId);
  }

  @OnQueueFailed()
  async onFailed(job: Job<BulkRedeemJobData>, error: Error) {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!isLastAttempt) return;

    const { batchId } = job.data;
    this.logger.error(
      `[JOB ${job.id}] All attempts exhausted for batch ${batchId ?? 'unknown'}: ${error.message}`
    );

    if (batchId) {
      await this.prisma.tempOfflineInkindRedemption
        .update({ where: { uuid: batchId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  }
}
