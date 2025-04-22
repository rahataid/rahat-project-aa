import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { CreateBeneficiaryRedeemDto, GetBeneficiaryRedeemDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { CvaBeneficiaryRedeemService } from './beneficiary-redeem.service';

@Controller()
export class CvaBeneficiaryRedeemController {
  constructor(private readonly benRedeemService: CvaBeneficiaryRedeemService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.REDEEM.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(data: CreateBeneficiaryRedeemDto) {
    return this.benRedeemService.create(data);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.REDEEM.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): unknown {
    return this.benRedeemService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.REDEEM.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetBeneficiaryRedeemDto) {
    return this.benRedeemService.findOne(payload);
  }
}
