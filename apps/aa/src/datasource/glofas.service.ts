import { HttpService } from "@nestjs/axios";
import { AbstractSource } from "./datasource.abstract";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { AddSchedule } from "../dto";
import { Logger } from "@nestjs/common";

export class GlofasService implements AbstractSource {
    private readonly logger = new Logger(GlofasService.name);

    constructor(
        private readonly httpService: HttpService,
        private eventEmitter: EventEmitter2,
        private readonly configService: ConfigService
    ) { }

    async criteriaCheck(payload: AddSchedule) {
        
        const dataSource = payload.dataSource;

        this.logger.log(`${dataSource}: monitoring`)
    }
}