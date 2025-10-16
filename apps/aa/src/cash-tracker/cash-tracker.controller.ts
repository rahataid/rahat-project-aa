import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CONTROLLERS, JOBS } from '../constants';
import {
  CashTrackerService,
  ExecuteActionRequest,
} from './cash-tracker.service';
import { MintTokenRequestDto } from './dto/mint-token.dto';

@Controller()
export class CashTrackerController {
  constructor(private readonly cashTrackerService: CashTrackerService) {}

  @MessagePattern({
    cmd: JOBS.CASH_TRACKER.EXECUTE_ACTION,
    uuid: process.env.PROJECT_ID,
  })
  async executeAction(@Payload() request: ExecuteActionRequest) {
    return this.cashTrackerService.executeAction(request);
  }

  @MessagePattern({
    cmd: JOBS.CASH_TRACKER.GET_TRANSACTIONS,
    uuid: process.env.PROJECT_ID,
  })
  async getTransactions() {
    return this.cashTrackerService.getTransactions();
  }
  @MessagePattern({
    cmd: JOBS.CASH_TRACKER.CREATE_BUDGET,
    uuid: process.env.PROJECT_ID,
  })
  async createBudget(mintTokenRequestDto: MintTokenRequestDto) {
    return this.cashTrackerService.createBudget(mintTokenRequestDto);
  }
}
