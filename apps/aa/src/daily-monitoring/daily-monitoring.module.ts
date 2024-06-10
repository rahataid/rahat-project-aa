import { Module } from "@nestjs/common";
import { PrismaModule } from "@rumsan/prisma";
import { DailyMonitoringController } from "./daily-monitoring.controller";
import { DailyMonitoringService } from "./daily-monitoring.service";

@Module({
    imports: [PrismaModule],
    controllers: [DailyMonitoringController],
    providers: [DailyMonitoringService],
})

export class DailyMonitoringModule { }