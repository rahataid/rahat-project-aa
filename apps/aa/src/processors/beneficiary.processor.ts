import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { GroupPurpose } from '@prisma/client';
import { BQUEUE, JOBS } from '../constants';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { AsyncQueueService } from '../queue/async-queue.service';

@Processor(BQUEUE.BENEFICIARY)
export class BeneficiaryProcessor {
  private readonly logger = new Logger(BeneficiaryProcessor.name);

  constructor(
    private readonly beneficiaryService: BeneficiaryService,
    private readonly asyncQueueService: AsyncQueueService
  ) {}

  // Kept low: each batch holds an interactive DB transaction.
  @Process({
    name: JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
    concurrency: 2,
  })
  async processCreateBeneficiariesInBatches(job: Job) {
    const payload = job.data as {
      beneficiaries: any[];
      beneficiaryGroupId: string;
      beneficiaryGroupName: string;
      groupPurpose: GroupPurpose;
      totalBatches: number;
      currentBatchIndex: number;
      _asyncJobId: string;
    };

    const { _asyncJobId, beneficiaryGroupId } = payload;
    const batchLabel = `batch ${payload.currentBatchIndex + 1}/${payload.totalBatches} of group ${beneficiaryGroupId}`;

    // Tracking row is removed when the group import fails, so remaining batches are skipped.
    const isActive = await this.asyncQueueService.markProcessing(_asyncJobId);
    if (!isActive) {
      this.logger.warn(`Skipping ${batchLabel}: import was cancelled`);
      return;
    }

    try {
      this.logger.log(`Processing ${batchLabel} with ${payload.beneficiaries.length} beneficiaries`);

      const result = await this.beneficiaryService.createBenfAndAddGroupToProject({
        projectId: process.env.PROJECT_ID,
        beneficiaries: payload.beneficiaries,
        beneficiaryGroupId,
        beneficiaryGroupName: payload.beneficiaryGroupName,
        groupPurpose: payload.groupPurpose,
      });

      await this.asyncQueueService.complete(_asyncJobId);
      await this.beneficiaryService.onGroupImportBatchCompleted(beneficiaryGroupId);

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(
        `Failed ${batchLabel} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${errMsg}`,
        error
      );

      if (isFinalAttempt) {
        await this.beneficiaryService.failGroupImport(beneficiaryGroupId, errMsg);
      }
      throw error;
    }
  }
}
