import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CvaBeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto, GetBeneficiaryDto } from '../dtos';
import { CVA_JOBS } from '../constants';
import { PaginationBaseDto } from '../dtos/common';

@Controller()
export class CVaBeneficiaryController {
  constructor(private readonly benService: CvaBeneficiaryService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.ADD_TO_PROJECT,
    uuid: process.env['PROJECT_ID'],
  })
  create(data: CreateBeneficiaryDto) {
    return this.benService.create(data);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  listBeneficiary(query: PaginationBaseDto) {
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
