import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ScheduleService } from './schedule.service';
import { AddSchedule, RemoveSchedule } from '../dto';

@Controller()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @MessagePattern({
    cmd: JOBS.SCHEDULE.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(): Promise<any> {
    return this.scheduleService.getAll();
  }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async create(data: AddSchedule): Promise<any> {
    return this.scheduleService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(data: RemoveSchedule): Promise<any> {
    return this.scheduleService.remove(data);
  }
}
