import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { BQUEUE, JOBS } from '../constants';
import { ChainServiceRegistry } from '../chain/registries/chain-service.registry';
import { ChainType } from '../chain/interfaces/chain-service.interface';

interface OfflineRedeemItem {
  redeemUuid: string;
  beneficiaryWalletAddress: string;
  vendorWalletAddress: string;
  amount: number;
}

interface OfflineRedeemBatchJobData {
  batchId: string;
}

@Injectable()
@Processor(BQUEUE.OFFLINE_REDEEM)
export class OfflineRedemptionProcessor implements OnModuleInit {
  private readonly logger = new Logger(OfflineRedemptionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.OFFLINE_REDEEM)
    private readonly offlineRedeemQueue: Queue,
    private readonly chainServiceRegistry: ChainServiceRegistry
  ) {}

  async onModuleInit() {
    const pending = await this.prisma.tempOfflineRedemption.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
    });

    if (pending.length === 0) return;

    this.logger.log(`[RESTART] Found ${pending.length} unfinished offline redemption batch(es), re-queuing...`);

    for (const record of pending) {
      try {
        await this.offlineRedeemQueue.add(
          JOBS.VENDOR.OFFLINE_REDEEM_BATCH,
          { batchId: record.uuid },
          {
            jobId: record.uuid,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        );

        await this.prisma.tempOfflineRedemption.update({
          where: { uuid: record.uuid },
          data: { status: 'PENDING' },
        });

        this.logger.log(`[RESTART] Re-queued batch ${record.uuid}`);
      } catch (err: any) {
        this.logger.warn(`[RESTART] Could not re-queue batch ${record.uuid}: ${err?.message}`);
      }
    }
  }

  @Process({ name: JOBS.VENDOR.OFFLINE_REDEEM_BATCH, concurrency: 1 })
  async handle(job: Job<OfflineRedeemBatchJobData>) {
    const { batchId } = job.data;
    const batch = await this.prisma.tempOfflineRedemption.findUnique({ where: { uuid: batchId } });
    if (!batch) {
      this.logger.warn(`[JOB ${job.id}] Batch ${batchId} not found — skipping`);
      return;
    }

    await this.prisma.tempOfflineRedemption.update({
      where: { uuid: batchId },
      data: { status: 'PROCESSING' },
    });

    const items = batch.payloads as unknown as OfflineRedeemItem[];
    this.logger.log(`[JOB ${job.id}] Processing ${items.length} item(s) for batch ${batchId} on chain ${batch.chainType}`);

    const chainService = await this.chainServiceRegistry.getChainService(batch.chainType as ChainType);
    const results = await chainService.transferOfflineRedemptionBatch(
      items.map((i) => ({
        beneficiaryWalletAddress: i.beneficiaryWalletAddress,
        vendorWalletAddress: i.vendorWalletAddress,
        amount: i.amount,
      }))
    );

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const result = results[idx];
      try {
        if (!result?.txHash) throw new Error(result?.error || 'Transfer failed');

        await this.prisma.beneficiaryRedeem.update({
          where: { uuid: item.redeemUuid },
          data: {
            txHash: result.txHash,
            isCompleted: true,
            status: 'COMPLETED',
            vendorUid: batch.vendorId,
          },
        });

        this.logger.log(`[JOB ${job.id}] Redeemed ${item.redeemUuid} — tx ${result.txHash}`);
      } catch (err: any) {
        this.logger.error(`[JOB ${job.id}] Item ${item.redeemUuid} failed: ${err?.message}`, err?.stack);
        await this.prisma.beneficiaryRedeem
          .update({
            where: { uuid: item.redeemUuid },
            data: { info: { error: err?.message } },
          })
          .catch(() => {});
      }
    }

    await this.prisma.tempOfflineRedemption.update({
      where: { uuid: batchId },
      data: { status: 'COMPLETED' },
    });

    this.logger.log(`[JOB ${job.id}] Batch ${batchId} complete`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<OfflineRedeemBatchJobData>, error: Error) {
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!isLastAttempt) return;

    const { batchId } = job.data;
    this.logger.error(`[JOB ${job.id}] All attempts exhausted for batch ${batchId ?? 'unknown'}: ${error.message}`);

    if (batchId) {
      await this.prisma.tempOfflineRedemption
        .update({ where: { uuid: batchId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  }
}
