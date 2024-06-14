import { Controller } from "@nestjs/common";
import { DailyMonitoringService } from "./daily-monitoring.service";
import { MessagePattern } from "@nestjs/microservices";
import { JOBS } from "../constants";
import { AddDailyMonitoringData, GetDailyMonitoringData, GetOneMonitoringData, RemoveMonitoringData, UpdateMonitoringData } from "./dto";

@Controller()
export class DailyMonitoringController {
    constructor(private readonly dailyMonitoringService: DailyMonitoringService) { }

    @MessagePattern({
        cmd: JOBS.DAILY_MONITORING.ADD,
        uuid: process.env.PROJECT_ID,
    })
    async add(payload: AddDailyMonitoringData) {
        return this.dailyMonitoringService.add(payload)
    }

    @MessagePattern({
        cmd: JOBS.DAILY_MONITORING.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll(payload: GetDailyMonitoringData) {
        return this.dailyMonitoringService.getAll(payload)
    }

    @MessagePattern({
        cmd: JOBS.DAILY_MONITORING.GET_ONE,
        uuid: process.env.PROJECT_ID,
    })
    async getOne(payload: GetOneMonitoringData) {
        return this.dailyMonitoringService.getOne(payload)
    }

    @MessagePattern({
        cmd: JOBS.DAILY_MONITORING.UPDATE,
        uuid: process.env.PROJECT_ID,
    })
    async update(payload: UpdateMonitoringData) {
        return this.dailyMonitoringService.update(payload)
    }

    @MessagePattern({
        cmd: JOBS.DAILY_MONITORING.REMOVE,
        uuid: process.env.PROJECT_ID,
    })
    async remove(payload: RemoveMonitoringData) {
        return this.dailyMonitoringService.remove(payload)
    }
}