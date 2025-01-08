import { Controller } from '@nestjs/common';

import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { CreateVendorDto, GetVendorDto, PaginationBaseDto } from '../dtos';
import { CvaVendorService } from './vendor.service';

@Controller()
export class CVaVendorController {
  constructor(private readonly vendorService: CvaVendorService) {}

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.ADD_TO_PROJECT,
    uuid: process.env['PROJECT_ID'],
  })
  create(dto: CreateVendorDto) {
    return this.vendorService.create(dto);
  }

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(data: any) {
    return data;
  }

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.LIST_WITH_PROJECT_DATA,
    uuid: process.env['PROJECT_ID'],
  })
  listWithData(query: PaginationBaseDto): any {
    return this.vendorService.listWithProjectData(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.VENDOR.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(payload: GetVendorDto) {
    return this.vendorService.findOne(payload);
  }
}
