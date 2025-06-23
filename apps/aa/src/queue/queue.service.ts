import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BQUEUE } from '../constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(BQUEUE.OFFRAMP) private offrampQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
    @InjectQueue(BQUEUE.COMMUNICATION) private communicationQueue: Queue,
    @InjectQueue(BQUEUE.TRIGGER) private triggerQueue: Queue,
    @InjectQueue(BQUEUE.SCHEDULE) private scheduleQueue: Queue,
    @InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue
  ) {}

  async waitForConnection(): Promise<void> {
    const queues = [
      { name: BQUEUE.OFFRAMP, queue: this.offrampQueue },
      { name: BQUEUE.STELLAR, queue: this.stellarQueue },
      { name: BQUEUE.COMMUNICATION, queue: this.communicationQueue },
      { name: BQUEUE.TRIGGER, queue: this.triggerQueue },
      { name: BQUEUE.SCHEDULE, queue: this.scheduleQueue },
      { name: BQUEUE.CONTRACT, queue: this.contractQueue },
    ];

    for (const { name, queue } of queues) {
      try {
        await queue.isReady();
        this.logger.log(`✅ ${name} connection ready`);
      } catch (error) {
        this.logger.error(`❌ ${name} connection failed:`, error);
        throw error;
      }
    }
  }

  async verifyProcessorsReady(): Promise<void> {
    // Add a small delay to ensure all processors are registered
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const queues = [
      this.offrampQueue,
      this.stellarQueue,
      this.communicationQueue,
      this.triggerQueue,
      this.scheduleQueue,
      this.contractQueue,
    ];

    for (const queue of queues) {
      const workers = await queue.getWorkers();
      this.logger.log(`Queue ${queue.name} has ${workers.length} workers`);
    }
  }

  async closeAllConnections(): Promise<void> {
    const queues = [
      this.offrampQueue,
      this.stellarQueue,
      this.communicationQueue,
      this.triggerQueue,
      this.scheduleQueue,
      this.contractQueue,
    ];

    await Promise.all(
      queues.map(async (queue) => {
        try {
          await queue.close();
          this.logger.log(`✅ Closed connection for ${queue.name}`);
        } catch (error) {
          this.logger.error(`❌ Error closing ${queue.name}:`, error);
        }
      })
    );
  }
}
