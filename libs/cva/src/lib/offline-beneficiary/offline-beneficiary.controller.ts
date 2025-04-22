import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { PaginationBaseDto } from '../dtos/common';
import {
  CreateOfflineBeneficiaryDto,
  GetOfflineBeneficiaryDto,
} from '../dtos/offline-beneficiary';
import { CvaOfflineBeneficiaryService } from './offline-beneficiary.service';

@Controller()
export class CvaOfflineBeneficiaryController {
  constructor(
    private readonly offlineBenefService: CvaOfflineBeneficiaryService
  ) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.OFFLINE.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(data: CreateOfflineBeneficiaryDto) {
    return this.offlineBenefService.create(data);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.OFFLINE.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): unknown {
    return this.offlineBenefService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY.OFFLINE.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetOfflineBeneficiaryDto) {
    return this.offlineBenefService.findOne(payload);
  }
}
