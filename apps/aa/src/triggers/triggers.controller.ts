import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { TriggersService } from './triggers.service';
import { AddDataSource, RemoveDataSource } from '../dto';
import { GetTriggers } from './dto';

@Controller()
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) { }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(payload: GetTriggers): Promise<any> {
    return this.triggersService.getAll(payload);
  }

  /***********************
  * Development Only
  *************************/
  @MessagePattern({
    cmd: JOBS.SCHEDULE.DEV_ONLY,
    uuid: process.env.PROJECT_ID,
  })
  async devOnly(data: AddDataSource): Promise<any> {
    return this.triggersService.dev(data);
  }
  /********************************* */

  @MessagePattern({
    cmd: JOBS.SCHEDULE.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async create(data: AddDataSource): Promise<any> {
    return this.triggersService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.SCHEDULE.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(data: RemoveDataSource): Promise<any> {
    return this.triggersService.remove(data);
  }
}
