import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { GrievancesService } from './grievances.service';

@Controller()
export class GrievancesController {
  constructor(private readonly grievancesService: GrievancesService) {}

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  create(data: CreateGrievanceDto) {
    return this.grievancesService.create(data);
  }

  @MessagePattern({ cmd: JOBS.GRIEVANCES.LIST, uuid: process.env.PROJECT_ID })
  listAll() {
    console.log('Grievances Controller listAll');
    return this.grievancesService.listAll();
  }
}
