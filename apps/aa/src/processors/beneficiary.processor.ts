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

  @Process({
    name: JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
    concurrency: 5,
  })
  async processCreateBeneficiariesInBatches(job: Job) {
    const payload = job.data as {
      beneficiaries: any[];
      beneficiaryGroupId: string;
      beneficiaryGroupName: string;
      groupPurpose: GroupPurpose;
      totalBatches: number;
      currentBatchIndex: number;
      isLastBatch: boolean;
      _asyncJobId: string;
    };

    const { _asyncJobId } = payload;

    try {
      await this.asyncQueueService.markProcessing(_asyncJobId);

      this.logger.log(
        `Processing batch ${payload.currentBatchIndex + 1}/${payload.totalBatches} with ${payload.beneficiaries.length} beneficiaries`
      );

      const dto = {
        projectId: process.env.PROJECT_ID,
        beneficiaries: payload.beneficiaries,
        beneficiaryGroupId: payload.beneficiaryGroupId,
        beneficiaryGroupName: payload.beneficiaryGroupName,
        groupPurpose: payload.groupPurpose,
      };

      const result = await this.beneficiaryService.createBenfAndAddGroupToProject(
        dto,
        true
      );

      if (payload.isLastBatch) {
        this.logger.log(
          `All batches completed for group ${payload.beneficiaryGroupId}`
        );
      }

      await this.asyncQueueService.complete(_asyncJobId);

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process beneficiary batch: ${errMsg}`,
        error
      );
      await this.asyncQueueService.fail(_asyncJobId, errMsg);
      throw error;
    }
  }
}
