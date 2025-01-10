import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { CreateBeneficiaryOtpDto, GetBeneficiaryOtpDto } from '../dtos';
import { CvaBeneficiaryOtpService } from './beneficiary-otp.service';

@Controller()
export class CvaBeneficiaryOtpController {
  constructor(private readonly service: CvaBeneficiaryOtpService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.OTP.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(data: CreateBeneficiaryOtpDto) {
    return this.service.create(data);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.REDEEM.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetBeneficiaryOtpDto) {
    return this.service.findOne(payload);
  }
}
