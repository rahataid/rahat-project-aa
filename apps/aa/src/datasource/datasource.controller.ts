import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { DhmService } from './dhm.service';

@Controller()
export class DataSourceController {
  constructor(private readonly dhmService: DhmService) { }

  @MessagePattern({
    cmd: JOBS.RIVER_STATIONS.GET_DHM,
    uuid: process.env.PROJECT_ID,
  })
  async getDhmStations(): Promise<any> {
    return this.dhmService.getRiverStations()
  }

  @MessagePattern({
    cmd: JOBS.WATER_LEVELS.GET_DHM,
    uuid: process.env.PROJECT_ID,
  })
  async getDhmWaterLevels(): Promise<any> {
    return this.dhmService.getWaterLevels()
  }

}
