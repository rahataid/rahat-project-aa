import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { HazardTypesService } from './hazard-types.service';

@Controller()
export class HazardTypesController {
    constructor(private readonly hazardTypesService: HazardTypesService) { }

    @MessagePattern({
        cmd: JOBS.HAZARD_TYPES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll() {
        return this.hazardTypesService.getAll()
    }
}
