import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ActivitiesService } from './activities.service';
import { AddActivityData, GetActivitiesDto, GetOneActivity, RemoveActivityData } from './dto';

@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) { }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.ADD,
    uuid: process.env.PROJECT_ID,
  })
  async add(payload: AddActivityData) {
    return this.activitiesService.add(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.GET_ALL,
    uuid: process.env.PROJECT_ID,
  })
  async getAll(payload: GetActivitiesDto) {
    return this.activitiesService.getAll(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.GET_ONE,
    uuid: process.env.PROJECT_ID,
  })
  async getOne(payload: GetOneActivity) {
    return await this.activitiesService.getOne(payload);
  }


  @MessagePattern({
    cmd: JOBS.ACTIVITIES.REMOVE,
    uuid: process.env.PROJECT_ID,
  })
  async remove(payload: RemoveActivityData) {
    return this.activitiesService.remove(payload);
  }

  @MessagePattern({
    cmd: JOBS.COMMUNICATION.TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async triggerCommunication(payload: { campaignId: string }) {
    return this.activitiesService.triggerCommunication(payload.campaignId);
  }
}
