import { Injectable } from "@nestjs/common";
import { BeneficiaryStatService } from "../beneficiary/beneficiaryStat.service";
import { OnEvent } from "@nestjs/event-emitter";
import { EVENTS } from "../constants";

@Injectable()
export class ListernersService {
    constructor(
        private readonly aaStats: BeneficiaryStatService
    ) { }

    @OnEvent(EVENTS.BENEFICIARY_CREATED)
    @OnEvent(EVENTS.BENEFICIARY_REMOVED)
    @OnEvent(EVENTS.BENEFICIARY_UPDATED)
    async onBeneficiaryChanged() {
        await this.aaStats.saveAllStats()
    }
}