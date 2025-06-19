import { Controller, Post, Body } from '@nestjs/common';
import { ChainService } from './chain.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller('chain')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @MessagePattern({
    cmd: 'jobs.chain.disburse',
    uuid: process.env.PROJECT_ID,
  })
  disburse(data: any) {
    return this.chainService.disburse(data);
  }
}
