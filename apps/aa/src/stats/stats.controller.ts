import { Controller, Get, Param, Inject } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsCalculationService } from './stats-calculation.service';
import { MessagePattern, Payload, ClientProxy } from '@nestjs/microservices';
import { JOBS, TRIGGGERS_MODULE } from '../constants';
import { firstValueFrom } from 'rxjs';

@Controller()
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly statsCalculationService: StatsCalculationService,
    @Inject(TRIGGGERS_MODULE) private readonly client: ClientProxy
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
    const [triggeersStats, tokenStats] = await Promise.all([
      firstValueFrom(
        this.client.send({ cmd: JOBS.STATS.MS_TRIGGERS_STATS }, payload)
      ),
      this.statsService.getTokenStats(),
    ]);
    return {
      message: 'Stats Synced Successfully',
      data: {
        stats,
        triggeersStats,
        tokenStats,
      },
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
