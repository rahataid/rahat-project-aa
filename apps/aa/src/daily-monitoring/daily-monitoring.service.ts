import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";
import { AddDailyMonitoringData, GetDailyMonitoringData } from "./dto";

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class DailyMonitoringService {
    private readonly logger = new Logger(DailyMonitoringService.name);

    constructor(
        private prisma: PrismaService
    ) { }

    async add(payload: AddDailyMonitoringData) {
        console.log('service payload::', payload)
        const { source, location, ...rest } = payload
        return await this.prisma.dailyMonitoring.create({
            data: { source, location, data: JSON.stringify(rest) }
        })
    }

    async getAll(payload: GetDailyMonitoringData) {
        const { page, perPage } = payload;

        return paginate(this.prisma.dailyMonitoring, {
            page,
            perPage
        })
    }
}