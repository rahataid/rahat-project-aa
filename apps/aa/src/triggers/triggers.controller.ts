import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { TriggersService } from './triggers.service';
import {
  AddTriggerStatement,
  RemoveTriggerStatement,
  UpdateTriggerStatement,
} from '../dto';
import { GetOneTrigger, GetTriggers } from './dto';

@Controller()
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  /***********************
   * Development Only
   *************************/
  @MessagePattern({
    cmd: JOBS.TRIGGERS.DEV_ONLY,
    uuid: process.env.PROJECT_ID,
  })
  async devOnly(data: AddTriggerStatement): Promise<any> {
    return this.triggersService.dev(data);
  }
  /********************************* */

  @MessagePattern({
    cmd: JOBS.TRIGGERS.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  async getOne(payload: GetOneTrigger): Promise<any> {
    return this.triggersService.getOne(payload);
  }

  @MessagePattern({
    cmd: JOBS.TRIGGERS.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(payload: GetTriggers): Promise<any> {
    return this.triggersService.getAll(payload);
  }

  @MessagePattern({
    cmd: JOBS.TRIGGERS.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async create(data: AddTriggerStatement): Promise<any> {
    return this.triggersService.create(data);
  }

  @MessagePattern({
    cmd: JOBS.TRIGGERS.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(data: RemoveTriggerStatement): Promise<any> {
    return this.triggersService.remove(data);
  }

  @MessagePattern({
    cmd: JOBS.TRIGGERS.ACTIVATE,
    uuid: process.env.PROJECT_ID,
  })
  async activate(payload: UpdateTriggerStatement) {
    return this.triggersService.activateTrigger(payload);
  }
}
