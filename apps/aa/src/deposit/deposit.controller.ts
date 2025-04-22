import { Body, Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS, STELLER_UID } from '../constants';
import { DepositService } from './deposit.service';
import { SendOTPDto, VerifyOtpDto } from './dto';

@Controller('deposit')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @MessagePattern({ cmd: JOBS.STELLAR.SEND_OTP, STELLER_UID })
  sendOTP(@Body() createDepositDto: SendOTPDto) {
    return this.depositService.sendOTP(createDepositDto);
  }

  @MessagePattern({ cmd: JOBS.STELLAR.VERIFY_OTP, STELLER_UID })
  verifyOTP(@Body() verifyOtpDto: VerifyOtpDto) {
    try {
      return this.depositService.verifyOTP(verifyOtpDto.auth, verifyOtpDto);
    } catch (error) {
      return error;
    }
  }
}
