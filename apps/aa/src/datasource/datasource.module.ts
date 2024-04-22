import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { DhmService } from "./dhm.service";
import { GlofasService } from "./glofas.service";
import { DataSourceController } from "./datasource.controller";
import { PrismaModule } from "@rumsan/prisma";

@Module({
    imports: [HttpModule,PrismaModule],
    controllers: [DataSourceController],
    providers: [DhmService, GlofasService],
    exports: [DhmService, GlofasService]
})
export class DataSourceModule { }
