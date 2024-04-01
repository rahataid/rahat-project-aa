import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { AddSchedule } from './dto';
import { ScheduleService } from './schedule.service';

@Controller()
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @MessagePattern({
    cmd: JOBS.SCHEDULE.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async create(data: AddSchedule): Promise<any> {
    return this.scheduleService.create(data);
  }
}
