import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { StellarChainService } from '../chain/chain-services/stellar-chain.service';
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
    this.logger.log(
      `Processing SEND_ASSET_TO_VENDOR for vendor ${job.data.vendorUuid}, amount ${job.data.amount}`
    );
    return this.stellarChainService.processSendAssetToVendor(job.data);
  }
}
