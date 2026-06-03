import { Module } from "@nestjs/common";
import { PrismaModule } from "@rumsan/prisma";
import { GroupCashTransferService } from "./group-cash-transfer.service";
import { GroupCashTransferController } from "./group-cash-transfer.controller";

@Module({
    imports: [PrismaModule],
    controllers: [GroupCashTransferController],
    providers: [GroupCashTransferService],
    exports: [GroupCashTransferService],
})

export class GroupCashTransferModule {}