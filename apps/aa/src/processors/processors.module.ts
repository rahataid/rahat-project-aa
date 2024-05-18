import { Module } from "@nestjs/common";
import { ScheduleProcessor } from "./schedule.processor";
import { DataSourceModule } from "../datasource/datasource.module";
import { TriggerProcessor } from "./trigger.processor";
import { PhasesModule } from "../phases/phases.module";

@Module({
    imports: [DataSourceModule, PhasesModule],
    providers: [ScheduleProcessor, TriggerProcessor]
})
export class ProcessorsModule { }