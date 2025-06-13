import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import {
  CreateVendorReimbursementDto,
  GetVendorReimbursementDto,
} from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { CvaVendorReimbursementService } from './vendor-reimbursement.service';

@Controller()
export class CvaVendorReimbursementController {
  constructor(
    private readonly venReimburseService: CvaVendorReimbursementService
  ) {}

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.REIMBURSE.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(data: CreateVendorReimbursementDto) {
    return this.venReimburseService.create(data);
  }

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.REIMBURSE.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): unknown {
    return this.venReimburseService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.REIMBURSE.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetVendorReimbursementDto) {
    return this.venReimburseService.findOne(payload);
  }
}
