import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CVA_JOBS } from '../constants';
import { PaginationBaseDto } from '../dtos/common';
import { CvaGroupService } from './group.service';
import { CreateGroupDto, GetGroupDto } from '../dtos';

@Controller()
export class CvaGroupController {
  constructor(private readonly groupService: CvaGroupService) {}

  @MessagePattern({
    cmd: CVA_JOBS.GROUP.CREATE,
    uuid: process.env['PROJECT_ID'],
  })
  create(dto: CreateGroupDto) {
    return this.groupService.create(dto);
  }

  @MessagePattern({
    cmd: CVA_JOBS.GROUP.LIST,
    uuid: process.env['PROJECT_ID'],
  })
  list(query: PaginationBaseDto): unknown {
    return this.groupService.list(query);
  }

  @MessagePattern({
    cmd: CVA_JOBS.GROUP.GET,
    uuid: process.env['PROJECT_ID'],
  })
  findOne(dto: GetGroupDto) {
    return this.groupService.findOne(dto);
  }
}
