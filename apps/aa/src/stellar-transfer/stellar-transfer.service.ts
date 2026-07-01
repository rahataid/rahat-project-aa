import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { FSPPayoutDetails } from '../processors/types';

@Injectable()
export class StellarTransferService {
  private readonly queueOpts = {
    delay: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  };

  constructor(
    @InjectQueue(BQUEUE.STELLAR_TRANSFER) private readonly queue: Queue
  ) {}

  async addBulkToTokenTransferQueue(payloads: FSPPayoutDetails[]): Promise<Job[]> {
    return Promise.all(payloads.map((p) => this.addToTokenTransferQueue(p)));
  }

  async addToTokenTransferQueue(payload: FSPPayoutDetails): Promise<Job> {
    return this.queue.add(JOBS.STELLAR.TRANSFER_TO_OFFRAMP, payload, this.queueOpts);
  }
}
