import { Module } from "@nestjs/common";
import { ScheduleProcessor } from "./schedule.processor";
import { DataSourceModule } from "../datasource/datasource.module";
import { TriggerProcessor } from "./trigger.processor";

@Module({
    imports: [DataSourceModule],
    providers: [ScheduleProcessor, TriggerProcessor]
})
export class ProcessorsModule { }