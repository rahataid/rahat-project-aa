import { BullModule, InjectQueue } from '@nestjs/bull';
import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { AsyncQueueRecoveryService } from './async-queue-recovery.service';
import { AsyncQueueService } from './async-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: BQUEUE.BENEFICIARY }),
    // needed here too so this module can inject it below to register recovery
    BullModule.registerQueue({ name: BQUEUE.STELLAR_SDP }),
  ],
  providers: [PrismaService, AsyncQueueService, AsyncQueueRecoveryService],
  exports: [AsyncQueueService, AsyncQueueRecoveryService],
})
export class QueueModule implements OnModuleInit {
  constructor(
    private readonly asyncQueueRecoveryService: AsyncQueueRecoveryService,
    @InjectQueue(BQUEUE.BENEFICIARY) private readonly beneficiaryQueue: Queue,
    // used only to hand the queue instance to asyncQueueRecoveryService.register() below
    @InjectQueue(BQUEUE.STELLAR_SDP) private readonly stellarSdpQueue: Queue
  ) {}

  onModuleInit() {
    // register {jobName, queue} pairs here to enable recovery on boot
    this.asyncQueueRecoveryService.register(
      JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
      this.beneficiaryQueue
    );
    // See docs/sdp/sdp-beneficiary-phone-sync-plan.md §4 — retries phone-sync
    // jobs that hit a transient 409 (e.g. payment in flight) on SDP's side.
    this.asyncQueueRecoveryService.register(
      JOBS.STELLAR_SDP.RECEIVER_PHONE_SYNC,
      this.stellarSdpQueue
    );
  }
}
