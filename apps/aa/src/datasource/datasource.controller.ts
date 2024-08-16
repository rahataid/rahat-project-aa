import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { DhmService } from './dhm.service';
import { GetWaterLevel } from './dto';
import { GlofasService } from './glofas.service';

@Controller()
export class DataSourceController {
  constructor(
    private readonly dhmService: DhmService,
    private readonly glofasService: GlofasService
  ) { }

  @MessagePattern({
    cmd: JOBS.RIVER_STATIONS.GET_DHM,
    uuid: process.env.PROJECT_ID,
  })
  async getDhmStations() {
    return this.dhmService.getRiverStations()
  }

  @MessagePattern({
    cmd: JOBS.WATER_LEVELS.GET_DHM,
    uuid: process.env.PROJECT_ID,
  })
  async getDhmWaterLevels(payload: GetWaterLevel) {
    return this.dhmService.getWaterLevels(payload)
  }

  @MessagePattern({
    cmd: JOBS.WATER_LEVELS.GET_GLOFAS,
    uuid: process.env.PROJECT_ID,
  })
  async getGlofasWaterLevels() {
    return this.glofasService.getLatestWaterLevels()
  }
}
