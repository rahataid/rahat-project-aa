import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { PhasesService } from './phases.service';
import { PhasesStatsService } from './phases.stats.service';

@Controller()
export class PhasesController {
    constructor(
        private readonly phasesService: PhasesService,
        private readonly phasesStatsService: PhasesStatsService,
    ) { }

    @MessagePattern({
        cmd: JOBS.PHASES.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll() {
        return this.phasesService.getAll()
    }

    @MessagePattern({
        cmd: JOBS.PHASES.GET_ONE,
        uuid: process.env.PROJECT_ID,
    })
    async getOne(payload: { uuid: string }) {
        return this.phasesService.getOne(payload)
    }

    @MessagePattern({
        cmd: JOBS.PHASES.ADD_TRIGGERS,
        uuid: process.env.PROJECT_ID,
    })
    async addTriggers(payload) {
        return this.phasesService.addTriggersToPhases(payload)
    }

    @MessagePattern({
        cmd: JOBS.PHASES.REVERT_PHASE,
        uuid: process.env.PROJECT_ID,
    })
    async revertPhase(payload) {
        return this.phasesService.revertPhase(payload)
    } 

    @MessagePattern({
        cmd: JOBS.PHASES.GET_STATS,
        uuid: process.env.PROJECT_ID,
    })
    async getStats() {
        return this.phasesStatsService.getStats()
    }
}
