import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { InkindsService } from './inkinds.service';
import {
  CreateInkindDto,
  UpdateInkindDto,
  GetInkindDto,
  DeleteInkindDto,
  ListInkindDto,
} from './dto/inkind.dto';

@Controller()
export class InkindsController {
  constructor(private readonly inkindsService: InkindsService) {}

  @MessagePattern({
    cmd: JOBS.INKINDS.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  create(@Payload() createInkindDto: CreateInkindDto) {
    return this.inkindsService.create(createInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  update(@Payload() updateInkindDto: UpdateInkindDto) {
    return this.inkindsService.update(updateInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.DELETE,
    uuid: process.env.PROJECT_ID,
  })
  delete(@Payload() deleteInkindDto: DeleteInkindDto) {
    return this.inkindsService.delete(deleteInkindDto.uuid);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET,
    uuid: process.env.PROJECT_ID,
  })
  get(@Payload() listInkindDto: ListInkindDto) {
    return this.inkindsService.get(listInkindDto);
  }

  @MessagePattern({
    cmd: JOBS.INKINDS.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  getOne(@Payload() getInkindDto: GetInkindDto) {
    return this.inkindsService.getOne(getInkindDto.uuid);
  }
}
