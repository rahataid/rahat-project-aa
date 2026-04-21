import { Controller } from '@nestjs/common';
import { FundService } from './fundallocation.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class FundAllocationController {
  constructor(private readonly fundService: FundService) {}

  @MessagePattern({
    cmd: JOBS.FUND_MANAGEMENT.ADD_FUND,
    uuid: process.env.PROJECT_ID,
  })
  addFund(@Payload() amount: string) {
    return this.fundService.addFundToProject(amount);
  }
}
