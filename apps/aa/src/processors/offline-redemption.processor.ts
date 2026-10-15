import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { BQUEUE, JOBS } from '../constants';
import { ChainServiceRegistry } from '../chain/registries/chain-service.registry';
import { ChainType } from '../chain/interfaces/chain-service.interface';
import { PayoutsService } from '../payouts/payouts.service';

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
    private readonly chainServiceRegistry: ChainServiceRegistry,
    private readonly payoutsService: PayoutsService
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

    // Retries re-enter this handler with the full stored payload. Skip redeems an earlier
    // attempt already completed so a retry only re-sends the failed items (never pays twice
    // for a row we already recorded as COMPLETED).
    const allItems = batch.payloads as unknown as OfflineRedeemItem[];
    const done = await this.prisma.beneficiaryRedeem.findMany({
      where: { uuid: { in: allItems.map((i) => i.redeemUuid) }, status: 'COMPLETED' },
      select: { uuid: true },
    });
    const doneIds = new Set(done.map((d) => d.uuid));
    const items = allItems.filter((i) => !doneIds.has(i.redeemUuid));
    this.logger.log(`[JOB ${job.id}] Processing ${items.length} item(s) for batch ${batchId} on chain ${batch.chainType}`);

    const chainService = await this.chainServiceRegistry.getChainService(batch.chainType as ChainType);
    const results = await chainService.transferOfflineRedemptionBatch(
      items.map((i) => ({
        beneficiaryWalletAddress: i.beneficiaryWalletAddress,
        vendorWalletAddress: i.vendorWalletAddress,
        amount: i.amount,
      }))
    );

    // Group by outcome (items in a chunk share one txHash / one error) so each group is a
    // single updateMany instead of one write per item.
    // key = txHash on success, error message on failure
    const groups = new Map<string, { ok: boolean; ids: string[] }>();
    items.forEach((item, idx) => {
      const r = results[idx];
      const ok = !!r?.txHash;
      const key = ok ? r.txHash! : r?.error || 'Transfer failed';
      const g = groups.get(key) ?? { ok, ids: [] };
      g.ids.push(item.redeemUuid);
      groups.set(key, g);
    });

    // failed is the count of items left unpaid, used below to decide whether to retry the job
    let failed = 0;
    const completedIds: string[] = [];
    for (const [key, { ok, ids }] of groups) {
      if (ok) {
        completedIds.push(...ids);
        await this.prisma.beneficiaryRedeem.updateMany({
          where: { uuid: { in: ids } },
          data: { txHash: key, isCompleted: true, status: 'COMPLETED', vendorUid: batch.vendorId },
        });
        this.logger.log(`[JOB ${job.id}] Redeemed ${ids.length} item(s) — tx ${key}`);
      } else {
        failed += ids.length;
        await this.prisma.beneficiaryRedeem.updateMany({
          where: { uuid: { in: ids } },
          data: { info: { error: key } },
        });
        this.logger.error(`[JOB ${job.id}] ${ids.length} item(s) failed: ${key}`);
      }
    }

    // payout status is derived from redeem rows, so once per payout after all writes
    // (not once per item) gives the same final state.
    if (completedIds.length) {
      const payouts = await this.prisma.beneficiaryRedeem.findMany({
        where: { uuid: { in: completedIds }, payoutId: { not: null } },
        select: { payoutId: true },
        distinct: ['payoutId'],
      });
      // sequential + caught: a status-sync problem on one payout must not fail the job, since
      // the transfers are already on-chain and a retry would only re-find them COMPLETED
      for (const { payoutId } of payouts) {
        await this.payoutsService.checkAndCompletePayout(payoutId!).catch((err) =>
          this.logger.error(`[JOB ${job.id}] checkAndCompletePayout ${payoutId} failed: ${err?.message}`, err?.stack)
        );
      }
    }

    // ponytail: Bull's attempts/backoff is the retry queue; only the failed items are re-sent
    // because completed ones are filtered out above. Last attempt falls through to COMPLETED
    // with per-row errors, as before.
    if (failed > 0 && job.attemptsMade + 1 < (job.opts.attempts ?? 1)) {
      throw new Error(`${failed} offline redemption item(s) failed, retrying`);
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
