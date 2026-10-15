import { Controller } from '@nestjs/common';
import { ChainService } from './chain.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AddCvaEvidenceDto,
  CheckOtpDto,
  RedeemInkindDto,
} from './interfaces/chain-service.interface';
import { JOBS } from '../constants';

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
    cmd: 'aa.jobs.chain.checkOtp',
    uuid: process.env.PROJECT_ID,
  })
  checkOtp(data: CheckOtpDto) {
    return this.chainService.checkOtp(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.addCvaEvidence',
    uuid: process.env.PROJECT_ID,
  })
  addCvaEvidence(data: AddCvaEvidenceDto) {
    return this.chainService.addCvaEvidence(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.getWalletBalance',
    uuid: process.env.PROJECT_ID,
  })
  getWalletBalance(data: { address: string }) {
    return this.chainService.getWalletBalance(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.getRahatTokenBalance',
    uuid: process.env.PROJECT_ID,
  })
  getRahatTokenBalance(data: { address: string }) {
    return this.chainService.getRahatTokenBalance(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.chain.getDisbursementStats',
    uuid: process.env.PROJECT_ID,
  })
  getDisbursementStats(
    @Payload() payload: { startDate: string; endDate: string }
  ) {
    return this.chainService.getDisbursementStats(payload);
  }

  @MessagePattern({
    cmd: JOBS.CHAIN.REDEEM_INKIND,
    uuid: process.env.PROJECT_ID,
  })
  redeemInkind(data: RedeemInkindDto) {
    return this.chainService.redeemInkind(data);
  }

  @MessagePattern({
    cmd: JOBS.CHAIN.REDEEM_VENDOR_INKIND_TOKENS,
    uuid: process.env.PROJECT_ID,
  })
  redeemVendorInkindTokens(data: any) {
    return this.chainService.redeemVendorInkindTokens(data);
  }
}
