import { Controller } from '@nestjs/common';
import { OtpService } from './otp.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @MessagePattern({
    cmd: JOBS.SMS.SEND_SMS,
    uuid: process.env.PROJECT_ID,
  })
  async sendSms(payload: { number: string; message: string }) {
    return this.otpService.sendSms(payload.number, payload.message);
  }
}
