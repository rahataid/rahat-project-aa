import { Module } from "@nestjs/common";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { PrismaModule } from "@rumsan/prisma";

@Module({
    imports: [PrismaModule],
    controllers: [PhasesController],
    providers: [PhasesService],
})
export class PhasesModule { }
