import { Injectable } from '@nestjs/common';
import { ChainQueueService } from './chain-queue.service';

@Injectable()
export class ChainService {
  constructor(private chainQueueService: ChainQueueService) {}

  disburse(disburseDto: any) {
    return this.chainQueueService.disburse(disburseDto);
  }

  sendOtp(sendOtpDto: any) {
    return this.chainQueueService.sendOtp(sendOtpDto);
  }

  sendAssetToVendor(sendAssetDto: any) {
    return this.chainQueueService.sendAssetToVendor(sendAssetDto);
  }

  getWalletBalance(data: { address: string }) {
    return this.chainQueueService.getWalletBalance(data);
  }

  getRahatTokenBalance(data: { address: string }) {
    return this.chainQueueService.getRahatTokenBalance(data);
  }

  getDisbursementStats() {
    return this.chainQueueService.getDisbursementStats();
  }
}
