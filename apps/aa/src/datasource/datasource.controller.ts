import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { DhmService } from './dhm.service';
import { AddSchedule, RemoveSchedule } from '../dto';

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

}
