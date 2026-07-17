import { Controller, Get, Param } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsCalculationService } from './stats-calculation.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller()
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly statsCalculationService: StatsCalculationService
  ) {}

  @MessagePattern({ cmd: JOBS.STATS.GET_ALL, uuid: process.env.PROJECT_ID })
  findAll(@Payload() payload) {
    return this.statsService.findAll(payload);
  }

  // Manual re-run: recalculates every stat for the project's current stat
  // type and overwrites what's in the stats table
  @MessagePattern({ cmd: JOBS.STATS.BACK_FILL, uuid: process.env.PROJECT_ID })
  async backFill(@Payload() payload) {
    const stats = await this.statsCalculationService.runAndSave(
      payload?.statType
    );
    return {
      message: 'Stats Synced Successfully',
      data: stats,
    };
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
