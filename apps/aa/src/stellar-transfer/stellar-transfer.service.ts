import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { SettingsService } from '@rumsan/settings';
import { BQUEUE, JOBS, STELLAR_TRANSFER_BATCH_SIZE } from '../constants';
import { FSPPayoutDetails, StellarTransferBatchPayload } from '../processors/types';
import { chunkArray } from '../utils/utility';

@Injectable()
export class StellarTransferService implements OnModuleInit {
  private readonly logger = new Logger(StellarTransferService.name);
  private batchSize: number = STELLAR_TRANSFER_BATCH_SIZE;
  private readonly queueOpts = {
    delay: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  };

  constructor(
    @InjectQueue(BQUEUE.STELLAR_TRANSFER) private readonly queue: Queue,
    @InjectQueue(BQUEUE.STELLAR_TRANSFER_BATCH) private readonly batchQueue: Queue,
    private readonly settingsService: SettingsService
  ) {}

  async onModuleInit(): Promise<void> {
    this.batchSize = await this.getTransferBatchSize();
    this.logger.log(`Stellar payout transfer batch size set to ${this.batchSize}`);
  }

  private async getTransferBatchSize(): Promise<number> {
    try {
      const setting = await this.settingsService.getPublic(
        'STELLAR_DISBURSEMENT_SETTINGS'
      );
      const value = (setting?.value as Record<string, unknown>) || {};
      return Number(value.STELLAR_PAYOUT_TRANSFER_BATCH_SIZE) || STELLAR_TRANSFER_BATCH_SIZE;
    } catch {
      return STELLAR_TRANSFER_BATCH_SIZE;
    }
  }

  async addBulkToTokenTransferQueue(payloads: FSPPayoutDetails[]): Promise<Job[]> {
    this.logger.log(`Payout transfer happening for batch of ${this.batchSize}`);
    const batches = chunkArray(payloads, this.batchSize);
    return Promise.all(
      batches.map((transfers) =>
        this.batchQueue.add(
          JOBS.STELLAR.TRANSFER_TO_OFFRAMP_BATCH,
          { transfers } as StellarTransferBatchPayload,
          this.queueOpts
        )
      )
    );
  }

  async addToTokenTransferQueue(payload: FSPPayoutDetails): Promise<Job> {
    return this.queue.add(JOBS.STELLAR.TRANSFER_TO_OFFRAMP, payload, this.queueOpts);
  }
}
