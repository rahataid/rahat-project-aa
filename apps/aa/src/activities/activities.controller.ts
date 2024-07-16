import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ActivitiesService } from './activities.service';
import {
  ActivityDocs,
  AddActivityData,
  GetActivitiesDto,
  GetOneActivity,
  RemoveActivityData,
  UpdateActivityData,
} from './dto';
import { ActivitiesStatus } from '@prisma/client';

@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

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

  @MessagePattern({
    cmd: JOBS.COMMUNICATION.COMMUNICATION_LOGS,
    uuid: process.env.PROJECT_ID,
  })
  async communicationLogs() {
    return this.activitiesService.getCommunicationLogs();
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.UPDATE_STATUS,
    uuid: process.env.PROJECT_ID,
  })
  async updateStatus(payload: {
    uuid: string;
    status: ActivitiesStatus;
    activityDocuments: Array<ActivityDocs>;
    user: any;
  }) {
    return this.activitiesService.updateStatus(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.UPDATE,
    uuid: process.env.PROJECT_ID,
  })
  async update(payload: UpdateActivityData) {
    return this.activitiesService.update(payload);
  }
}
