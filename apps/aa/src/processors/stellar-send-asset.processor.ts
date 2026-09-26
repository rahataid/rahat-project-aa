import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  ReturnTokensJobData,
  StellarChainService,
} from '../chain/chain-services/stellar-chain.service';
import { BQUEUE, JOBS } from '../constants';

interface SendAssetToVendorJobData {
  phoneNumber: string;
  receiverAddress: string;
  amount: number;
  vendorUuid: string;
}

@Processor(BQUEUE.STELLAR_SEND_ASSET)
@Injectable()
export class StellarSendAssetProcessor {
  private readonly logger = new Logger(StellarSendAssetProcessor.name);

  constructor(private readonly stellarChainService: StellarChainService) {}

  @Process({ name: JOBS.STELLAR.SEND_ASSET_TO_VENDOR, concurrency: 1 })
  async handleSendAssetToVendor(
    job: Job<SendAssetToVendorJobData>
  ): Promise<{ txHash: string }> {
    const maxAttempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
    this.logger.log(
      `Processing SEND_ASSET_TO_VENDOR for vendor ${job.data.vendorUuid}, amount ${job.data.amount} (attempt ${job.attemptsMade + 1}/${maxAttempts})`
    );
    return this.stellarChainService.processSendAssetToVendor(job.data, isLastAttempt);
  }

  @Process({ name: JOBS.STELLAR.RETURN_TOKENS, concurrency: 1 })
  async handleReturnTokens(job: Job<ReturnTokensJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;
    this.logger.log(
      `Processing RETURN_TOKENS for payout ${job.data.payoutUuid}, ${job.data.wallets.length} wallet(s) (attempt ${job.attemptsMade + 1}/${maxAttempts})`
    );
    return this.stellarChainService.processReturnTokens(job.data, isLastAttempt);
  }
}
