import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { BQUEUE, JOBS, STELLAR_TRANSFER_BATCH_SIZE } from '../constants';
import { FSPPayoutDetails, StellarTransferBatchPayload } from '../processors/types';
import { chunkArray } from '../utils/utility';

@Injectable()
export class StellarTransferService {
  private readonly queueOpts = {
    delay: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  };

  constructor(
    @InjectQueue(BQUEUE.STELLAR_TRANSFER) private readonly queue: Queue,
    @InjectQueue(BQUEUE.STELLAR_TRANSFER_BATCH) private readonly batchQueue: Queue
  ) {}

  async addBulkToTokenTransferQueue(payloads: FSPPayoutDetails[]): Promise<Job[]> {
    const batches = chunkArray(payloads, STELLAR_TRANSFER_BATCH_SIZE);
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
