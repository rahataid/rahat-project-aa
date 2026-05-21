import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { InkindsService } from './inkinds.service';
import { BeneficiaryInkindRedeemDto, UserObject } from './dto/inkind.dto';

interface BulkRedeemJobData {
  payloads: BeneficiaryInkindRedeemDto[];
  user: UserObject;
  vendor: { uuid: string };
}

@Processor(BQUEUE.INKIND_BULK_REDEEM)
export class InkindBulkRedeemProcessor {
  private readonly logger = new Logger(InkindBulkRedeemProcessor.name);

  constructor(private readonly inkindsService: InkindsService) {}

  @Process({ name: JOBS.INKINDS.BULK_REDEEM_BATCH, concurrency: 1 })
  async handle(job: Job<BulkRedeemJobData>) {
    const { payloads, user, vendor } = job.data;
    this.logger.log(
      `[JOB ${job.id}] Processing bulk redeem batch: ${payloads.length} payloads, vendor=${vendor.uuid}`
    );
    return this.inkindsService.processBulkBatch(payloads, user, vendor);
  }
}
