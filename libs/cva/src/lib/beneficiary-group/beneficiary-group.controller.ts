import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { CreateBeneficiaryGroupDto, ListBeneficiaryByGroupDto } from '../dtos';
import { PaginationBaseDto } from '../dtos/common';
import { CvaBeneficiaryGroupService } from './beneficiary-group.service';

@Controller()
export class CvaBeneficiaryGroupController {
  constructor(private readonly benGroupService: CvaBeneficiaryGroupService) {}

  @MessagePattern({
    cmd: CVA_JOBS.BENEFICIARY_GROUP.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(dto: CreateBeneficiaryGroupDto) {
    return this.benGroupService.create(dto);
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
