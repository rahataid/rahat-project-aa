import { Module, forwardRef } from "@nestjs/common";
import { PhasesController } from "./phases.controller";
import { PhasesService } from "./phases.service";
import { PrismaModule } from "@rumsan/prisma";
import { BullModule } from "@nestjs/bull";
import { BQUEUE } from "../constants";
import { BeneficiaryModule } from "../beneficiary/beneficiary.module";
import { TriggersModule } from "../triggers/triggers.module";
import { PhasesStatsService } from "./phases.stats.service";
import { StatsModule } from "../stats";

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
        forwardRef(() => TriggersModule),
        StatsModule
    ],
    controllers: [PhasesController],
    providers: [PhasesService,PhasesStatsService],
    exports: [PhasesService, PhasesStatsService]
})
export class PhasesModule { }
