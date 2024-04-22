import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ScheduleService } from './schedule.service';
import { AddDataSource, RemoveDataSource } from '../dto';
import { GetSchedule } from './dto';

@Controller()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) { }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(payload: GetSchedule): Promise<any> {
    return this.scheduleService.getAll(payload);
  }

  /***********************
  * Development Only
  *************************/
  @MessagePattern({
    cmd: JOBS.SCHEDULE.DEV_ONLY,
    uuid: process.env.PROJECT_ID,
  })
  async devOnly(data: AddDataSource): Promise<any> {
    return this.scheduleService.dev(data);
  }
  /********************************* */

  @MessagePattern({
    cmd: JOBS.SCHEDULE.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async create(data: AddDataSource): Promise<any> {
    return this.scheduleService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(data: RemoveDataSource): Promise<any> {
    return this.scheduleService.remove(data);
  }
}
