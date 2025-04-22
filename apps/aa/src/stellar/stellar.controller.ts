import { Controller } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { FundAccountDto, SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';
import { DisburseDto } from './dto/disburse.dto';

@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  @MessagePattern({
    cmd: JOBS.STELLAR.DISBURSE,
    uuid: process.env.PROJECT_ID,
  })
  async disburse(disburseDto: DisburseDto) {
    return this.stellarService.disburse(disburseDto);
  }

  @MessagePattern({
    cmd: JOBS.STELLAR.SEND_OTP,
    uuid: process.env.PROJECT_ID,
  })
  async sendOtp(sendOtpDto: SendOtpDto) {
    return this.stellarService.sendOtp(sendOtpDto);
  }

  @MessagePattern({
    cmd: JOBS.STELLAR.VERIFY_OTP,
    uuid: process.env.PROJECT_ID,
  })
  async verifyOtp(sendOtpDto: VerifyOtpDto) {
    return this.stellarService.verifyOtp(sendOtpDto);
  }

  @MessagePattern({
    cmd: JOBS.STELLAR.FUND_STELLAR_ACCOUNT,
    uuid: process.env.PROJECT_ID,
  })
  async fundStellarAccount(account: FundAccountDto) {
    return this.stellarService.faucetAndTrustlineService(account);
  }
}
