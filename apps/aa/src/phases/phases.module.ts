import { Module } from "@nestjs/common";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { PrismaModule } from "@rumsan/prisma";
import { BullModule } from "@nestjs/bull";
import { BQUEUE } from "../constants";
import { BeneficiaryModule } from "../beneficiary/beneficiary.module";

@Module({
    imports: [
        PrismaModule,
        BullModule.registerQueue({
            name: BQUEUE.TRIGGER,
        }),
        BeneficiaryModule
    ],
    controllers: [PhasesController],
    providers: [PhasesService],
    exports: [PhasesService]
})
export class PhasesModule { }
