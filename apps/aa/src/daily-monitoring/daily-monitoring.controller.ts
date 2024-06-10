import { Controller } from "@nestjs/common";
import { DailyMonitoringService } from "./daily-monitoring.service";
import { MessagePattern } from "@nestjs/microservices";
import { JOBS } from "../constants";
import { AddDailyMonitoringData, GetDailyMonitoringData } from "./dto";

@Controller()
export class DailyMonitoringController {
    constructor(private readonly dailyMonitoringService: DailyMonitoringService) { }

    @MessagePattern({
        cmd: JOBS.DAILYMONITORING.ADD,
        uuid: process.env.PROJECT_ID,
    })
    async add(payload: AddDailyMonitoringData) {
        console.log('controller payload::', payload)
        return this.dailyMonitoringService.add(payload)
    }

    @MessagePattern({
        cmd: JOBS.DAILYMONITORING.GET_ALL,
        uuid: process.env.PROJECT_ID,
    })
    async getAll(payload: GetDailyMonitoringData) {
        return this.dailyMonitoringService.getAll(payload)
    }
}