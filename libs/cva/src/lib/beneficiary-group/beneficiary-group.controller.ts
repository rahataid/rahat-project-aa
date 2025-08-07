import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { AddBeneficiariesToGroupDto, ListBeneficiaryByGroupDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { CvaBeneficiaryGroupService } from './beneficiary-group.service';

@Controller()
export class CvaBeneficiaryGroupController {
  constructor(private readonly benGroupService: CvaBeneficiaryGroupService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY_GROUP.BULK_ASSIGN,
    uuid: process.env['PROJECT_ID'],
  })
  create(dto: AddBeneficiariesToGroupDto) {
    return this.benGroupService.addBeneficiariesToGroup(dto);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY_GROUP.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): unknown {
    return this.benGroupService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY_GROUP.LIST_BY_GROUP,
    uuid: process.env['PROJECT_ID'],
  })
  listBenByGroup(dto: ListBeneficiaryByGroupDto): unknown {
    return this.benGroupService.listBenefByGroup(dto);
  }
}
