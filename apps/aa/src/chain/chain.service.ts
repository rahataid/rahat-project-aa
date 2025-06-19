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
}
