import { Module } from "@nestjs/common";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { PrismaModule } from "@rumsan/prisma";
import { BullModule } from "@nestjs/bull";
import { BQUEUE } from "../constants";
import { BeneficiaryModule } from "../beneficiary/beneficiary.module";
import { TriggersModule } from "../triggers/triggers.module";

@Module({
    imports: [
        PrismaModule,
        BullModule.registerQueue({
            name: BQUEUE.TRIGGER,
        }),
        BullModule.registerQueue({
            name: BQUEUE.CONTRACT,
        }),
        BullModule.registerQueue({
            name: BQUEUE.COMMUNICATION,
        }),
        BeneficiaryModule,
        TriggersModule
    ],
    controllers: [PhasesController],
    providers: [PhasesService],
    exports: [PhasesService]
})
export class PhasesModule { }
