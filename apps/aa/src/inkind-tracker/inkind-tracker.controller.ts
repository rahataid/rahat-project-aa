import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CONTROLLERS, JOBS } from '../constants';
import {
  InkindTrackerService,
  ExecuteActionRequest,
} from './inkind-tracker.service';

@Controller()
export class InkindTrackerController {
  constructor(private readonly inkindTrackerService: InkindTrackerService) {}

  @MessagePattern({
    cmd: JOBS.INKIND_TRACKER.EXECUTE_ACTION,
    uuid: process.env.PROJECT_ID,
  })
  async executeAction(@Payload() request: ExecuteActionRequest) {
    return this.inkindTrackerService.executeAction(request);
  }

  @MessagePattern({
    cmd: JOBS.INKIND_TRACKER.GET_TRANSACTIONS,
    uuid: process.env.PROJECT_ID,
  })
  async getTransactions() {
    return this.inkindTrackerService.getTransactions();
  }
}
