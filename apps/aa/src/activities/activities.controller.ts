import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { ActivitiesService } from './activities.service';

@Controller()
export class ActivitiesController {
    constructor(private readonly activitiesService: ActivitiesService) { }

    @MessagePattern({
        cmd: JOBS.ACTIVITIES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll() {
        return this.activitiesService.getAll()
    }

    @MessagePattern({
        cmd: JOBS.ACTIVITIES.REMOVE,
        uuid: process.env.PROJECT_ID,
    })
    async remove(data: { uuid: string }) {
        return this.activitiesService.remove(data)
    }
}
