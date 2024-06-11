import { Controller, Get, Param } from '@nestjs/common';
import { StatsService } from './stats.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @MessagePattern({ cmd: JOBS.STATS.GET_ALL, uuid: process.env.PROJECT_ID })
  findAll() {
    return this.statsService.findAll();
  }

  @MessagePattern({ cmd: JOBS.STATS.GET_ONE, uuid: process.env.PROJECT_ID })
  findOne(payload) {
    return this.statsService.findOne(payload);
  }

  @MessagePattern({ cmd: JOBS.STATS.GET_COMMS, uuid: process.env.PROJECT_ID })
  getComms() {
    return this.statsService.getCommsStats();
  }
}
