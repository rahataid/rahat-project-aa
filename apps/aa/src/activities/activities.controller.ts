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
    cmd: JOBS.ACTIVITIES.GET_HAVING_COMMS,
    uuid: process.env.PROJECT_ID,
  })
  async getHavingComms(payload: GetActivitiesDto) {
    return this.activitiesService.getHavingComms(payload);
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
    cmd: JOBS.ACTIVITIES.COMMUNICATION.TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async triggerCommunication(payload: {
    communicationId: string;
    activityId: string;
  }) {
    return this.activitiesService.triggerCommunication(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.COMMUNICATION.SESSION_LOGS,
    uuid: process.env.PROJECT_ID,
  })
  async communicationLogs(payload: {communicationId: string, activityId: string}) {
    return this.activitiesService.getSessionLogs(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.COMMUNICATION.RETRY_FAILED,
    uuid: process.env.PROJECT_ID,
  })
  async retryFailedBroadcast(payload: {communicationId: string, activityId: string}) {
    return this.activitiesService.retryFailedBroadcast(payload);
  }

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.UPDATE_STATUS,
    uuid: process.env.PROJECT_ID,
  })
  async updateStatus(payload: {
    uuid: string;
    status: ActivitiesStatus;
    notes: string;
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

  @MessagePattern({
    cmd: JOBS.ACTIVITIES.COMMUNICATION.GET_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getCommsStats() {
    return this.activitiesService.getCommsStats();
  }

}
