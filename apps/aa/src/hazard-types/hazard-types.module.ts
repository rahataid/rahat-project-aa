import { Module } from "@nestjs/common";
import { HazardTypesController } from "./hazard-types.controller";
import { HazardTypesService } from "./hazard-types.service";
import { PrismaModule } from "@rumsan/prisma";

@Module({
    imports: [PrismaModule],
    controllers: [HazardTypesController],
    providers: [HazardTypesService],
})
export class HazardTypesModule { }
