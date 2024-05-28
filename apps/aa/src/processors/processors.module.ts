import { Module } from "@nestjs/common";
import { ScheduleProcessor } from "./schedule.processor";
import { DataSourceModule } from "../datasource/datasource.module";
import { TriggerProcessor } from "./trigger.processor";
import { PhasesModule } from "../phases/phases.module";
import { BeneficiaryModule } from "../beneficiary/beneficiary.module";
import { PrismaService } from "@rumsan/prisma";

@Module({
    imports: [DataSourceModule, PhasesModule, BeneficiaryModule],
    providers: [ScheduleProcessor, TriggerProcessor, PrismaService]
})
export class ProcessorsModule { }