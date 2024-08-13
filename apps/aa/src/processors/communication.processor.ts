import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, JOBS } from '../constants';
import { Job } from 'bull';
import { ActivitiesService } from '../activities/activities.service';

@Processor(BQUEUE.COMMUNICATION)
export class CommunicationProcessor {
  private readonly logger = new Logger(CommunicationProcessor.name);
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Process(JOBS.COMMUNICATION.TRIGGER)
  async processCommunicationTrigger(job: Job) {
    const payload = job.data
    await this.activitiesService.triggerCommunication({
      communicationId: payload.communicationId,
      activityId: payload.activityId
    })
    return
  }

}
