import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceStatusDto } from './dto/udpate-grievance-statuts.dto';
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

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.CHANGE_STATUS,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  updateStatus(@Payload() payload: UpdateGrievanceStatusDto) {
    return this.grievancesService.updateStatus(payload);
  }
}
