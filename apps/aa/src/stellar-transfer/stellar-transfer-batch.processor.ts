import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';
import { FSPPayoutDetails, StellarTransferBatchPayload } from '../processors/types';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { StellarClient } from '@rahataid/stellar';
import { BeneficiaryRedeem, Prisma } from '@prisma/client';

@Processor(BQUEUE.STELLAR_TRANSFER_BATCH)
@Injectable()
export class StellarTransferBatchProcessor {
  private readonly logger = new Logger(StellarTransferBatchProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    @InjectQueue(BQUEUE.OFFRAMP) private readonly offrampQueue: Queue
  ) {}

  @Process({ name: JOBS.STELLAR.TRANSFER_TO_OFFRAMP_BATCH, concurrency: 1 })
  async transferToOfframpBatch(job: Job<StellarTransferBatchPayload>) {
    const { transfers } = job.data;
    this.logger.log(`[Job ${job.id}] Processing batch of ${transfers.length} transfer(s) to offramp`);
    this.logger.debug(`[Job ${job.id}] Attempt ${job.attemptsMade + 1}, payload: ${JSON.stringify(transfers)}`);

    // Step 1 — Create or fetch a BeneficiaryRedeem record per transfer (mirrors transferToOfframp)
    const resolvedOrNull: ({ payload: FSPPayoutDetails; log: BeneficiaryRedeem } | null)[] = await Promise.all(
      transfers.map(async (payload) => {
        this.logger.debug(
          `[Job ${job.id}] ${payload.beneficiaryRedeemUUID ? `Fetching existing redeem ${payload.beneficiaryRedeemUUID}` : `Creating new redeem for wallet ${payload.beneficiaryWalletAddress}`}`
        );
        const log = payload.beneficiaryRedeemUUID
          ? await this.beneficiaryService.getBeneficiaryRedeem(payload.beneficiaryRedeemUUID)
          : await this.beneficiaryService.createBeneficiaryRedeem({
              status: 'TOKEN_TRANSACTION_INITIATED',
              transactionType: 'TOKEN_TRANSFER',
              fspId: payload.payoutProcessorId,
              amount: payload.amount,
              payout: { connect: { uuid: payload.payoutUUID } },
              Beneficiary: { connect: { walletAddress: payload.beneficiaryWalletAddress } },
              info: {
                offrampWalletAddress: payload.offrampWalletAddress,
                beneficiaryWalletAddress: payload.beneficiaryWalletAddress,
                payoutUUID: payload.payoutUUID,
                payoutProcessorId: payload.payoutProcessorId,
                numberOfAttempts: job.attemptsMade + 1,
              },
            } as Prisma.BeneficiaryRedeemCreateInput);
        if (!log) {
          this.logger.warn(
            `[Job ${job.id}] Beneficiary redeem ${payload.beneficiaryRedeemUUID} not found — skipping`
          );
          return null;
        }
        return { payload: { ...payload, beneficiaryRedeemUUID: log.uuid }, log };
      })
    );
    const resolved = resolvedOrNull.filter(
      (r): r is { payload: FSPPayoutDetails; log: BeneficiaryRedeem } => r !== null
    );
    this.logger.debug(
      `[Job ${job.id}] Resolved ${resolved.length}/${transfers.length} redeem record(s) (${transfers.length - resolved.length} skipped)`
    );

    // Step 2 — Persist resolved beneficiaryRedeemUUIDs back to the job so a Bull-level
    // retry of this same job doesn't re-create duplicate redeem rows.
    await job.update({ transfers: resolved.map((r) => r.payload) });

    // Step 3 — Skip already-completed items; ensure the rest are marked INITIATED.
    const pending: { payload: FSPPayoutDetails; log: BeneficiaryRedeem; attemptsMade: number }[] = [];
    for (const { payload, log } of resolved) {
      if (log.isCompleted) {
        this.logger.log(`[Job ${job.id}] Already completed for redeem ${log.uuid} — skipping`);
        continue;
      }
      if (log.status !== 'TOKEN_TRANSACTION_INITIATED') {
        await this.beneficiaryService.updateBeneficiaryRedeem(log.uuid, {
          status: 'TOKEN_TRANSACTION_INITIATED',
        });
      }
      pending.push({ payload, log, attemptsMade: ((log.info as any)?.numberOfAttempts || 0) + 1 });
    }

    if (!pending.length) {
      this.logger.log(`[Job ${job.id}] Nothing to process — all items already completed`);
      return;
    }
    this.logger.debug(`[Job ${job.id}] ${pending.length} item(s) pending processing`);

    // Step 4 — Bulk-fetch beneficiary wallet secrets in a single RPC call.
    const walletAddresses = pending.map((p) => p.payload.beneficiaryWalletAddress);
    this.logger.debug(`[Job ${job.id}] Fetching wallet secrets for ${walletAddresses.length} wallet(s)`);
    const walletDetails: { address: string; privateKey: string }[] = await lastValueFrom(
      this.client.send(
        { cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET },
        { walletAddresses, chain: 'stellar' }
      )
    );
    const secretByWallet = new Map(walletDetails.map((w) => [w.address, w.privateKey]));
    this.logger.debug(
      `[Job ${job.id}] Received ${walletDetails.length}/${walletAddresses.length} wallet secret(s)`
    );

    // Step 5 — Pre-validate every item before building the transaction. A Stellar
    // transaction is atomic — one bad operation fails the whole batch — so any item
    // that can't be included is marked failed and excluded up front instead.
    const validated: { payload: FSPPayoutDetails; log: BeneficiaryRedeem; attemptsMade: number; secret: string }[] = [];
    await Promise.all(
      pending.map(async (item) => {
        const secret = secretByWallet.get(item.payload.beneficiaryWalletAddress);
        if (!secret) {
          const message = `Beneficiary wallet secret not found for ${item.payload.beneficiaryWalletAddress}`;
          this.logger.warn(`[Job ${job.id}] [Redeem ${item.log.uuid}] ${message}`);
          await this.updateBeneficiaryRedeemAsFailed(item.log.uuid, message, item.attemptsMade, item.log.info);
          return;
        }

        const balanceStr = await this.stellarClient.getBalance(item.payload.beneficiaryWalletAddress);
        const balance = Math.floor(parseFloat(balanceStr ?? '0'));
        this.logger.debug(
          `[Job ${job.id}] [Redeem ${item.log.uuid}] Wallet ${item.payload.beneficiaryWalletAddress} balance: ${balance}`
        );

        if (balance <= 0) {
          const message = `Beneficiary has ${balance} rahat balance with wallet ${item.payload.beneficiaryWalletAddress}`;
          this.logger.warn(`[Job ${job.id}] [Redeem ${item.log.uuid}] ${message}`);
          await this.updateBeneficiaryRedeemAsFailed(item.log.uuid, message, item.attemptsMade, item.log.info);
          return;
        }

        if (balance < item.payload.amount) {
          const message = `Balance is less than the amount to be transferred. Current balance: ${balance}, Amount to be transferred: ${item.payload.amount}`;
          this.logger.warn(`[Job ${job.id}] [Redeem ${item.log.uuid}] ${message}`);
          await this.updateBeneficiaryRedeemAsFailed(item.log.uuid, message, item.attemptsMade, item.log.info);
          return;
        }

        validated.push({ ...item, secret });
      })
    );

    if (!validated.length) {
      this.logger.warn(`[Job ${job.id}] No valid transfers remain after pre-validation — skipping submission`);
      return;
    }

    // Step 6 — Submit ONE transaction covering every validated transfer.
    try {
      this.logger.log(`[Job ${job.id}] Submitting batch transfer for ${validated.length} beneficiary(ies)`);
      this.logger.debug(
        `[Job ${job.id}] Batch destinations: ${validated.map((item) => `${item.payload.beneficiaryWalletAddress}->${item.payload.offrampWalletAddress}:${item.payload.amount}`).join(', ')}`
      );

      const result = await this.stellarClient.sendFromSponsoredBatch(
        validated.map((item) => ({
          secret: item.secret,
          destination: item.payload.offrampWalletAddress,
          amount: item.payload.amount.toString(),
        }))
      );

      this.logger.log(`[Job ${job.id}] Batch transfer successful, txHash: ${result.hash}`);

      // Step 7 — Mark each validated item completed (sharing the one txHash) and queue
      // its fiat-side offramp leg.
      await Promise.all(
        validated.map(async (item) => {
          this.logger.debug(
            `[Job ${job.id}] [Redeem ${item.log.uuid}] Marking completed and queuing offramp for wallet ${item.payload.beneficiaryWalletAddress}`
          );
          await this.beneficiaryService.updateBeneficiaryRedeem(item.log.uuid, {
            status: 'TOKEN_TRANSACTION_COMPLETED',
            isCompleted: true,
            amount: item.payload.amount,
            txHash: result.hash,
            info: {
              message: 'Token transfer to offramp successful',
              transactionHash: result.hash,
              offrampWalletAddress: item.payload.offrampWalletAddress,
              beneficiaryWalletAddress: item.payload.beneficiaryWalletAddress,
              numberOfAttempts: item.attemptsMade,
            },
          });

          const offrampPayload = { ...item.payload };
          delete offrampPayload.beneficiaryRedeemUUID;

          await this.offrampQueue.add(
            JOBS.OFFRAMP.INSTANT_OFFRAMP,
            {
              ...offrampPayload,
              transactionHash: result.hash,
              amount: item.payload.amount.toString(),
            },
            {
              delay: 1000,
              attempts: 1,
              backoff: { type: 'exponential', delay: 1000 },
            }
          );
        })
      );

      this.logger.log(`[Job ${job.id}] Queued INSTANT_OFFRAMP for ${validated.length} beneficiary(ies)`);

      return result;
    } catch (error: any) {
      this.logger.error(`[Job ${job.id}] Batch transfer failed: ${error.message}`, error.stack);
      this.logger.debug(
        `[Job ${job.id}] Marking ${validated.length} redeem(s) as failed: ${validated.map((item) => item.log.uuid).join(', ')}`
      );

      await Promise.all(
        validated.map((item) =>
          this.updateBeneficiaryRedeemAsFailed(item.log.uuid, error.message, item.attemptsMade, item.log.info)
        )
      );

      throw error;
    }
  }

  private async updateBeneficiaryRedeemAsFailed(
    uuid: string,
    error: string,
    numberOfAttempts?: number,
    info?: any
  ): Promise<BeneficiaryRedeem> {
    return this.beneficiaryService.updateBeneficiaryRedeem(uuid, {
      status: 'TOKEN_TRANSACTION_FAILED',
      isCompleted: false,
      info: {
        ...(info ?? {}),
        error,
        ...(numberOfAttempts ? { numberOfAttempts } : {}),
      },
    });
  }
}
