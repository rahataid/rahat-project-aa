import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PhasesService } from './phases.service';

@Controller()
export class PhasesController {
    constructor(private readonly phasesService: PhasesService) { }

    @MessagePattern({
        cmd: JOBS.PHASES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll() {
        return this.phasesService.getAll()
    }

    @MessagePattern({
        cmd: JOBS.PHASES.GET_STATS,
        uuid: process.env.PROJECT_ID,
    })
    async getStats(payload) {
        // return this.phasesService.addTriggersToPhases(payload)
        return this.phasesService.getOne(payload)
    }
}
