import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { PhoneNumberUtil } from 'google-libphonenumber';
import { Logger } from '@nestjs/common';
import { OtpService } from '../otp/otp.service';
import { PrismaService } from '@rumsan/prisma';

@Processor(BQUEUE.COMMUNICATION)
export class InkindProcessor {
  private readonly logger = new Logger(InkindProcessor.name);
  constructor(
    private readonly otpService: OtpService,
    private readonly prisma: PrismaService
  ) {}

  @Process({ name: JOBS.INKINDS.SEND_BENEFICIARY_OTP_ON_QUEUE, concurrency: 5 })
  async handleSendBeneficiaryOtp(job: Job<{ phone: string }>) {
    const { phone } = job.data;

    this.logger.log(
      `Processing job to send OTP to beneficiary with phone: ${phone}`
    );

    // verify phone number is valid or not
    const { success, isValid } = await this.isValidNepaliNumber(phone);
    if (!success) {
      this.logger.error(
        `Failed to validate phone number: ${phone}. Skipping OTP sending.`
      );
      return;
    }

    if (!isValid) {
      this.logger.warn(
        `Invalid Nepali phone number: ${phone}. Skipping OTP sending.`
      );
      return;
    }
    // get master opt of that benf
    const defaultOpt = await this.prisma.otp.findUnique({
      where: { phoneNumber: phone },
    });

    // send otp to beneficiary phone number
    return this.otpService.sendSms(
      phone,
      'Your OTP for inkind redemption is:',
      defaultOpt?.otp
    );
  }

  async isValidNepaliNumber(
    phone: string
  ): Promise<{ success: boolean; isValid: boolean }> {
    const phoneUtil = PhoneNumberUtil.getInstance();
    try {
      const number = phoneUtil.parse(phone, 'NP');
      const isValid =
        phoneUtil.isValidNumber(number) &&
        phoneUtil.getRegionCodeForNumber(number) === 'NP';
      return {
        success: true,
        isValid,
      };
    } catch (e) {
      this.logger.error('Error validating nepali number', e);
      return {
        success: false,
        isValid: false,
      };
    }
  }
}
