import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { CreateIvrTemplateDto } from './dto/create-ivr-template.dto';
import { UpdateIvrTemplateDto } from './dto/update-ivr-template.dto';
import { IvrTemplatesService } from './ivr-templates.service';

@Controller()
export class IvrTemplatesController {
  constructor(private readonly ivrTemplatesService: IvrTemplatesService) {}

  @MessagePattern({
    cmd: JOBS.IVR_TEMPLATES.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Payload() data: CreateIvrTemplateDto) {
    return this.ivrTemplatesService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.IVR_TEMPLATES.LIST,
    uuid: process.env.PROJECT_ID,
  })
  findAll() {
    return this.ivrTemplatesService.findAll();
  }

  @MessagePattern({
    cmd: JOBS.IVR_TEMPLATES.GET,
    uuid: process.env.PROJECT_ID,
  })
  findOne(@Payload() payload: { id: number }) {
    return this.ivrTemplatesService.findOne(payload.id);
  }

  @MessagePattern({
    cmd: JOBS.IVR_TEMPLATES.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  update(@Payload() data: UpdateIvrTemplateDto) {
    return this.ivrTemplatesService.update(data);
  }

  @MessagePattern({
    cmd: JOBS.IVR_TEMPLATES.DELETE,
    uuid: process.env.PROJECT_ID,
  })
  remove(@Payload() payload: { id: number }) {
    return this.ivrTemplatesService.remove(payload.id);
  }
}
