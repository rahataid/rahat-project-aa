import { Module } from '@nestjs/common';
import { CvaBeneficiaryOtpController } from './beneficiary-otp.controller';
import { CvaBeneficiaryOtpService } from './beneficiary-otp.service';

@Module({
  imports: [],
  controllers: [CvaBeneficiaryOtpController],
  providers: [CvaBeneficiaryOtpService],
})
export class CvaBeneficiaryOtpModule {}
