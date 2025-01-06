import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CvaBeneficiaryService } from './beneficiary.service';
import {
  CreateBeneficiaryDto,
  GetBeneficiaryDto,
  PaginationBaseDto,
} from '../dtos';
import { CVA_JOBS } from '../constants';

@Controller()
export class CVaBeneficiaryController {
  constructor(private readonly benService: CvaBeneficiaryService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(dto: CreateBeneficiaryDto) {
    console.log('Create from cva!');
    return this.benService.create(dto);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  listBeneficiary(query: PaginationBaseDto) {
    console.log('List from cva!');
    return this.benService.listWithPii(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetBeneficiaryDto) {
    return this.benService.findOne(payload);
  }
}
