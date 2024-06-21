import { Module } from "@nestjs/common";
import { ListernersService } from "./listeners.service";
import { StatsService } from "../stats";
import { BeneficiaryStatService } from "../beneficiary/beneficiaryStat.service";

@Module({
    imports: [],
    providers: [ListernersService, StatsService, BeneficiaryStatService]
})
export class ListenersModule { }