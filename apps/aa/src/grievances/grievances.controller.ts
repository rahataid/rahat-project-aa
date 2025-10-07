import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { ValidationError } from 'class-validator';
import { JOBS } from '../constants';
import { CreateGrievanceDto } from './dto/create-grievance.dto';
import { UpdateGrievanceStatusDto } from './dto/update-grievance-status.dto';
import { GrievancesService } from './grievances.service';
import { FindGrievanceParamsDto } from './dto/find-one.dto';
import { RemoveGrievanceDto } from './dto/remove-grievance.dto';
import { UpdateGrievanceDto } from './dto/update-grievance.dto';
import { ListGrievanceDto } from './dto/list-grievance.dto';
import { validationExceptionFactory } from './utils/grievances.controller.utils';

@Controller()
export class GrievancesController {
  constructor(private readonly grievancesService: GrievancesService) {}

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.CREATE,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
      exceptionFactory: validationExceptionFactory,
    })
  )
  create(@Payload() data: CreateGrievanceDto) {
    return this.grievancesService.create(data);
  }

  @MessagePattern({ cmd: JOBS.GRIEVANCES.LIST, uuid: process.env.PROJECT_ID })
  // @UsePipes(
  //   new ValidationPipe({
  //     transform: true,
  //     whitelist: true,
  //     forbidNonWhitelisted: true,
  //     validationError: { target: false },
  //     exceptionFactory: validationExceptionFactory,
  //   })
  // )
  listAll(@Payload() payload: ListGrievanceDto) {
    return this.grievancesService.listAll(payload);
  }

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.UPDATE_STATUS,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
      exceptionFactory: validationExceptionFactory,
    })
  )
  updateStatus(@Payload() payload: UpdateGrievanceStatusDto) {
    return this.grievancesService.updateStatus(payload);
  }

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
      exceptionFactory: validationExceptionFactory,
    })
  )
  update(@Payload() payload: UpdateGrievanceDto) {
    console.log('grievance update controller');
    return this.grievancesService.update(payload);
  }

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.GET,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
      exceptionFactory: validationExceptionFactory,
    })
  )
  findOne(@Payload() payload: FindGrievanceParamsDto) {
    return this.grievancesService.findOne(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
      exceptionFactory: validationExceptionFactory,
    })
  )
  remove(@Payload() payload: RemoveGrievanceDto) {
    return this.grievancesService.remove(payload.uuid);
  }

  @MessagePattern({
    cmd: JOBS.GRIEVANCES.GET_OVERVIEW_STATS,
    uuid: process.env.PROJECT_ID,
  })
  getOverviewStats() {
    return this.grievancesService.getOverviewStats();
  }
}
