import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PhasesService } from './phases.service';

@Controller()
export class PhasesController {
    constructor(private readonly phasesService: PhasesService) { }

    @MessagePattern({
        cmd: JOBS.HAZARD_TYPES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll() {
        return this.phasesService.getAll()
    }
}
