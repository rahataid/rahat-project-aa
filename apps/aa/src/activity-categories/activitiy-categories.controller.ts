import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ActivityCategoriesService } from './activity-categories.service';
import { AddActivityCategory, GetActivityCategory, RemoveActivityCategory } from './dto';

@Controller()
export class ActivityCategoriesController {
    constructor(private readonly activitiesService: ActivityCategoriesService) { }

    @MessagePattern({
        cmd: JOBS.ACTIVITY_CATEGORIES.ADD,
        uuid: process.env.PROJECT_ID,
    })
    async add(payload: AddActivityCategory) {
        return this.activitiesService.add(payload)
    }

    @MessagePattern({
        cmd: JOBS.ACTIVITY_CATEGORIES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll(payload: GetActivityCategory) {
        return this.activitiesService.getAll(payload)
    }

    @MessagePattern({
        cmd: JOBS.ACTIVITY_CATEGORIES.REMOVE,
        uuid: process.env.PROJECT_ID,
    })
    async remove(payload: RemoveActivityCategory) {
        return this.activitiesService.remove(payload)
    }
}
