import { Controller } from '@nestjs/common';
import { ChainService } from './chain.service';
import { MessagePattern } from '@nestjs/microservices';

@Controller('chain')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @MessagePattern({
    cmd: 'aa.chain.disburse',
    uuid: process.env.PROJECT_ID,
  })
  disburse(data: any) {
    return this.chainService.disburse(data);
  }

  @MessagePattern({
    cmd: 'aa.chain.sendOtp',
    uuid: process.env.PROJECT_ID,
  })
  sendOtp(data: any) {
    return this.chainService.sendOtp(data);
  }

  @MessagePattern({
    cmd: 'aa.chain.sendAsset',
    uuid: process.env.PROJECT_ID,
  })
  sendAssetToVendor(data: any) {
    return this.chainService.sendAssetToVendor(data);
  }
}
