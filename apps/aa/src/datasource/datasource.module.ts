import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { DhmService } from "./dhm.service";
import { GlofasService } from "./glofas.service";
import { DataSourceController } from "./datasource.controller";
import { PrismaModule } from "@rumsan/prisma";
import { DataSourceService } from "./datasource.service";
import { BullModule } from "@nestjs/bull";
import { BQUEUE } from "../constants";

@Module({
    imports: [
        HttpModule,
        PrismaModule,
        BullModule.registerQueue({
            name: BQUEUE.TRIGGER,
        })],
    controllers: [DataSourceController],
    providers: [DhmService, GlofasService, DataSourceService],
    exports: [DhmService, GlofasService, DataSourceService]
})
export class DataSourceModule { }
