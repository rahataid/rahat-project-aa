import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";
import { AddDailyMonitoringData, GetDailyMonitoringData, GetOneMonitoringData, RemoveMonitoringData, UpdateMonitoringData } from "./dto";

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class DailyMonitoringService {
    private readonly logger = new Logger(DailyMonitoringService.name);

    constructor(
        private prisma: PrismaService
    ) { }

    async add(payload: AddDailyMonitoringData) {
        const { source, location } = payload
        return await this.prisma.dailyMonitoring.create({
            data: { source, location, data: JSON.parse(JSON.stringify(payload)) }
        })
    }

    async getAll(payload: GetDailyMonitoringData) {
        const { page, perPage } = payload;

        const query = {
            where: {
                isDeleted: false,
            },
        }

        return paginate(this.prisma.dailyMonitoring, query, {
            page,
            perPage
        })
    }

    async getOne(payload: GetOneMonitoringData) {
        const { uuid } = payload;
        return await this.prisma.dailyMonitoring.findUnique({
            where: {
                uuid: uuid,
            }
        })
    }

    async update(payload: UpdateMonitoringData) { console.log('update payload::', payload) }

    async remove(payload: RemoveMonitoringData) {
        const { uuid } = payload;
        return await this.prisma.dailyMonitoring.update({
            where: {
                uuid: uuid,
            },
            data: {
                isDeleted: true,
            }
        })
    }
}