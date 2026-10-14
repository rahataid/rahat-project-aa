import { Injectable } from '@nestjs/common';
import { ChainQueueService } from './chain-queue.service';
import {
  AddCvaEvidenceDto,
  CheckOtpDto,
} from './interfaces/chain-service.interface';

@Injectable()
export class ChainService {
  constructor(private chainQueueService: ChainQueueService) {}

  disburse(disburseDto: any) {
    return this.chainQueueService.disburse(disburseDto);
  }

  preDisburse(disburseDto: any) {
    return this.chainQueueService.preDisburse(disburseDto);
  }

  sendOtp(sendOtpDto: any) {
    return this.chainQueueService.sendOtp(sendOtpDto);
  }

  sendAssetToVendor(sendAssetDto: any) {
    return this.chainQueueService.sendAssetToVendor(sendAssetDto);
  }

  checkOtp(data: CheckOtpDto) {
    return this.chainQueueService.checkOtp(data);
  }

  addCvaEvidence(data: AddCvaEvidenceDto) {
    return this.chainQueueService.addCvaEvidence(data);
  }

  getWalletBalance(data: { address: string }) {
    return this.chainQueueService.getWalletBalance(data);
  }

  getRahatTokenBalance(data: { address: string }) {
    return this.chainQueueService.getRahatTokenBalance(data);
  }

  getDisbursementStats(payload: { startDate: string; endDate: string }) {
    return this.chainQueueService.getDisbursementStats(payload);
  }

  redeemInkind(redeemDto: any) {
    return this.chainQueueService.redeemInkind(redeemDto);
  }

  redeemVendorInkindTokens(redeemVendorInkindDto: any) {
    return this.chainQueueService.redeemVendorInkindTokens(
      redeemVendorInkindDto
    );
  }
}
