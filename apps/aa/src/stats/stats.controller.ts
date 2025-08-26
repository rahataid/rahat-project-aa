import { Controller, Get, Param } from '@nestjs/common';
import { StatsService } from './stats.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @MessagePattern({ cmd: JOBS.STATS.GET_ALL, uuid: process.env.PROJECT_ID })
  findAll(@Payload() payload) {
    return this.statsService.findAll(payload);
  }

  @MessagePattern({
    cmd: JOBS.STATS.GET_MAP_LOCATION,
    uuid: process.env.PROJECT_ID,
  })
  benefLocation(@Payload() payload) {
    return this.statsService.mapLocation(payload);
  }
  @MessagePattern({ cmd: JOBS.STATS.GET_ONE, uuid: process.env.PROJECT_ID })
  findOne(payload) {
    return this.statsService.findOne(payload);
  }
}
