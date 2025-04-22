import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import {
  CreateCommunicationDto,
  TriggerCommunicationDto,
} from '../dtos/communication/create-communication.dto';
import { CvaCommunicationService } from './communication.service';
import { CVA_JOBS } from '../constants';
import { BroadCastMessage } from '../constants/types';

@Controller()
export class CvaCommunicationController {
  constructor(private readonly cvaCommService: CvaCommunicationService) {}

  @MessagePattern({
    cmd: CVA_JOBS.COMMUNICATION.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  createCampaign(dto: CreateCommunicationDto) {
    return this.cvaCommService.createCampaign(dto);
  }

  @MessagePattern({
    cmd: CVA_JOBS.COMMUNICATION.TRIGGER_CAMPAIGN,
    location: process.env['PROJECT_LOCATION'],
  })
  triggerCampaing(dto: TriggerCommunicationDto) {
    console.log(dto);
    return this.cvaCommService.triggerCommunication(dto);
  }
  @MessagePattern({
    cmd: CVA_JOBS.COMMUNICATION.GET_SESSION_DETAILS,
    uuid: process.env['PROJECT_ID'],
  })
  getSession(payload: { sessionId: string }) {
    return this.cvaCommService.getsession(payload);
  }

  @MessagePattern({
    cmd: CVA_JOBS.COMMUNICATION.GET_TRANSPORT_DETAILS,
    uuid: process.env['PROJECT_ID'],
  })
  getTransportDetails(payload: { transportId: string }) {
    return this.cvaCommService.getTransportDetails(payload);
  }

  // @MessagePattern({
  //   cmd: CVA_JOBS.COMMUNICATION.BROAD_CAST_CREATE,
  //   uuid: process.env['PROJECT_ID'],
  // })
  // broadCastMessage(payload: any) {
  //   return this.cvaCommService.broadcastMessages(payload);
  // }
}
