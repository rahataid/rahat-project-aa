import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StellarChainService } from '../chain/chain-services/stellar-chain.service';
import { BQUEUE, JOBS } from '../constants';
import { RedeemInkindDto } from '../chain/interfaces/chain-service.interface';

@Processor(BQUEUE.STELLAR_INKIND_REDEEM)
@Injectable()
export class StellarInkindRedeemProcessor {
  private readonly logger = new Logger(StellarInkindRedeemProcessor.name);

  constructor(private readonly stellarChainService: StellarChainService) {}

  // concurrency: 1 — serializes distribution wallet sends so concurrent
  // redemptions don't race the account's sequence number.
  @Process({ name: JOBS.STELLAR.REDEEM_INKIND, concurrency: 1 })
  async handleRedeemInkind(job: Job<RedeemInkindDto>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
    this.logger.log(
      `Processing REDEEM_INKIND for vendor ${job.data.vendorAddress}, amount ${job.data.amount} (attempt ${job.attemptsMade + 1}/${maxAttempts})`
    );
    return this.stellarChainService.processRedeemInkind(job.data, isLastAttempt);
  }
}
