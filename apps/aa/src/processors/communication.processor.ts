import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { BQUEUE, JOBS } from '../constants';
import { Job } from 'bull';
import { CommunicationService } from '@rumsan/communication/services/communication.client';
import { ConfigService } from '@nestjs/config';

@Processor(BQUEUE.COMMUNICATION)
export class CommunicationProcessor {
  private readonly logger = new Logger(CommunicationProcessor.name);
  private communicationService: CommunicationService;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.communicationService = new CommunicationService({
      baseURL: this.configService.get('COMMUNICATION_URL'),
      headers: {
        appId: this.configService.get('COMMUNICATION_APP_ID'),
      },
    });
  }

  @Process(JOBS.COMMUNICATION.TRIGGER)
  async processCommunicationTrigger(job: Job) {
    const campaignId = job.data
    await this.communicationService.communication.triggerCampaign(campaignId)
    return
  }

}
