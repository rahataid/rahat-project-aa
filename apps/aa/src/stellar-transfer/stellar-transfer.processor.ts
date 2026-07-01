import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { BQUEUE, CORE_MODULE, JOBS, STELLAR_CLIENT } from '../constants';
import { FSPPayoutDetails } from '../processors/types';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { StellarClient } from '@rahataid/stellar';
import { BeneficiaryRedeem, Prisma } from '@prisma/client';

@Processor(BQUEUE.STELLAR_TRANSFER)
@Injectable()
export class StellarTransferProcessor {
  private readonly logger = new Logger(StellarTransferProcessor.name);

  constructor(
    @Inject(STELLAR_CLIENT) private readonly stellarClient: StellarClient,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly beneficiaryService: BeneficiaryService,
    @InjectQueue(BQUEUE.OFFRAMP) private readonly offrampQueue: Queue
  ) {}

  @Process({ name: JOBS.STELLAR.TRANSFER_TO_OFFRAMP, concurrency: 1 })
  async transferToOfframp(job: Job<FSPPayoutDetails>) {
    this.logger.log(`[Job ${job.id}] Processing transfer to offramp for wallet ${job.data.beneficiaryWalletAddress}`);

    const payload = { ...job.data };

    // Step 1 — Create or fetch BeneficiaryRedeem record
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

    // Step 2 — Persist beneficiaryRedeemUUID back to job if newly created
    if (!payload.beneficiaryRedeemUUID) {
      await job.update({ ...job.data, beneficiaryRedeemUUID: log.uuid });
    }

    // Step 3 — Track attempt count
    const attemptsMade = ((log.info as any)?.numberOfAttempts || 0) + 1;

    // Step 4 — Guard: skip if already completed
    if (log.isCompleted) {
      this.logger.log(`[Job ${job.id}] Already completed for redeem ${log.uuid} — skipping`);
      return;
    }

    // Step 5 — Ensure status is TOKEN_TRANSACTION_INITIATED
    if (log.status !== 'TOKEN_TRANSACTION_INITIATED') {
      await this.beneficiaryService.updateBeneficiaryRedeem(log.uuid, {
        status: 'TOKEN_TRANSACTION_INITIATED',
      });
    }

    let markedFailed = false;

    try {
      // Step 6 — Get beneficiary wallet secret
      const keys: { address: string; privateKey: string } | null = await lastValueFrom(
        this.client.send(
          { cmd: JOBS.WALLET.GET_SECRET_BY_WALLET },
          { walletAddress: payload.beneficiaryWalletAddress, chain: 'stellar' }
        )
      );

      if (!keys) {
        markedFailed = true;
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          `Beneficiary wallet secret not found for ${payload.beneficiaryWalletAddress}`,
          attemptsMade,
          log.info
        );
        throw new Error(`No secret found for wallet ${payload.beneficiaryWalletAddress}`);
      }

      // Step 7 — Check on-chain token balance
      const balanceStr = await this.stellarClient.getBalance(payload.beneficiaryWalletAddress);
      const balance = Math.floor(parseFloat(balanceStr ?? '0'));

      this.logger.log(`[Job ${job.id}] Wallet ${payload.beneficiaryWalletAddress} balance: ${balance}`);

      if (balance <= 0) {
        markedFailed = true;
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          `Beneficiary has ${balance} rahat balance with wallet ${payload.beneficiaryWalletAddress}`,
          attemptsMade,
          log.info
        );
        throw new Error(`Zero balance for ${payload.beneficiaryWalletAddress}`);
      }

      if (balance < payload.amount) {
        markedFailed = true;
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          `Balance is less than the amount to be transferred. Current balance: ${balance}, Amount to be transferred: ${payload.amount}`,
          attemptsMade,
          log.info
        );
        throw new Error(`Insufficient balance for ${payload.beneficiaryWalletAddress}`);
      }

      // Step 8 — Transfer token to offramp wallet using sponsored account mechanism
      this.logger.log(
        `[Job ${job.id}] Transferring ${payload.amount} tokens from ${payload.beneficiaryWalletAddress} to ${payload.offrampWalletAddress}`
      );

      const result = await this.stellarClient.sendFromSponsored(
        keys.privateKey,
        payload.offrampWalletAddress,
        payload.amount.toString()
      );

      this.logger.log(`[Job ${job.id}] Transfer successful, txHash: ${result.hash}`);

      // Step 9 — Mark redeem as completed in DB
      await this.beneficiaryService.updateBeneficiaryRedeem(log.uuid, {
        status: 'TOKEN_TRANSACTION_COMPLETED',
        isCompleted: true,
        amount: payload.amount,
        txHash: result.hash,
        info: {
          message: 'Token transfer to offramp successful',
          transactionHash: result.hash,
          offrampWalletAddress: payload.offrampWalletAddress,
          beneficiaryWalletAddress: payload.beneficiaryWalletAddress,
          numberOfAttempts: attemptsMade,
        },
      });

      // Step 10 — Queue instant offramp request
      const offrampPayload = { ...payload };
      delete offrampPayload.beneficiaryRedeemUUID;

      await this.offrampQueue.add(
        JOBS.OFFRAMP.INSTANT_OFFRAMP,
        {
          ...offrampPayload,
          transactionHash: result.hash,
          amount: payload.amount.toString(),
        },
        {
          delay: 1000,
          attempts: 1,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );

      this.logger.log(`[Job ${job.id}] Queued INSTANT_OFFRAMP for wallet ${payload.beneficiaryWalletAddress}`);

      return result;
    } catch (error) {
      this.logger.error(`[Job ${job.id}] Transfer failed: ${error.message}`, error.stack);

      if (!markedFailed) {
        await this.updateBeneficiaryRedeemAsFailed(
          log.uuid,
          error.message,
          attemptsMade,
          log.info
        );
      }

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
