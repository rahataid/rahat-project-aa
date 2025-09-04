import { Controller, Post, Body } from '@nestjs/common';
import { ChainService } from './chain.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller('chain')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @MessagePattern({
    cmd: 'aa.jobs.chain.disburse',
    uuid: process.env.PROJECT_ID,
  })
  disburse(data: any) {
    return this.chainService.disburse(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.sendOtp',
    uuid: process.env.PROJECT_ID,
  })
  sendOtp(data: any) {
    return this.chainService.sendOtp(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.sendAsset',
    uuid: process.env.PROJECT_ID,
  })
  sendAssetToVendor(data: any) {
    return this.chainService.sendAssetToVendor(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.getWalletBalance',
    uuid: process.env.PROJECT_ID,
  })
  getWalletBalance(data: { address: string }) {
    return this.chainService.getWalletBalance(data);
  }

  // @MessagePattern({
  //   cmd: 'rahat.jobs.chain.getDisbursementStats',
  //   uuid: process.env.PROJECT_ID,
  // })
  // getDisbursementStats() {
  //   return this.chainService.getDisbursementStats();
  // }
}
