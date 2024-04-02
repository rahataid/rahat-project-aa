import { Module } from "@nestjs/common";
import { ScheduleProcessor } from "./schedule.processor";
import { DataSourceModule } from "../datasource/datasource.module";

@Module({
    imports: [DataSourceModule],
    providers: [ScheduleProcessor]
})
export class ProcessorsModule { }