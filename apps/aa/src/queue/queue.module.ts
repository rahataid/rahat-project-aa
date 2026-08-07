import { BullModule, InjectQueue } from '@nestjs/bull';
import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { AsyncQueueRecoveryService } from './async-queue-recovery.service';
import { AsyncQueueService } from './async-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: BQUEUE.BENEFICIARY })],
  providers: [PrismaService, AsyncQueueService, AsyncQueueRecoveryService],
  exports: [AsyncQueueService, AsyncQueueRecoveryService],
})
export class QueueModule implements OnModuleInit {
  constructor(
    private readonly asyncQueueRecoveryService: AsyncQueueRecoveryService,
    @InjectQueue(BQUEUE.BENEFICIARY) private readonly beneficiaryQueue: Queue
  ) {}

  onModuleInit() {
    // register {jobName, queue} pairs here to enable recovery on boot
    this.asyncQueueRecoveryService.register(
      JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
      this.beneficiaryQueue
    );
  }
}
