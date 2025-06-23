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

  @MessagePattern({
    cmd: 'jobs.chain.sendOtp',
    uuid: process.env.PROJECT_ID,
  })
  sendOtp(data: any) {
    return this.chainService.sendOtp(data);
  }

  @MessagePattern({
    cmd: 'jobs.chain.sendAsset',
    uuid: process.env.PROJECT_ID,
  })
  sendAssetToVendor(data: any) {
    return this.chainService.sendAssetToVendor(data);
  }
}
