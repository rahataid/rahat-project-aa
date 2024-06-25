import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";
import { AddDailyMonitoringData, GetDailyMonitoringData, GetOneMonitoringData, RemoveMonitoringData, UpdateMonitoringData } from "./dto";
import { RpcException } from "@nestjs/microservices";

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class DailyMonitoringService {
    private readonly logger = new Logger(DailyMonitoringService.name);

    constructor(
        private prisma: PrismaService
    ) { }

    async add(payload: AddDailyMonitoringData) {
        const { dataEntryBy, location, data } = payload;
        // const allData = JSON.parse(JSON.stringify(data));

        // const sanitizedDataArray = allData.map((item: any) => ({
        //     dataEntryBy,
        //     location,
        //     source: item.source,
        //     data: {
        //         dataEntryBy,
        //         location,
        //         ...item
        //     }
        // }));

        // const response = await this.prisma.dailyMonitoring.createMany({
        //     data: sanitizedDataArray
        // });

        // return response;
        return await this.prisma.dailyMonitoring.create({
            data: { dataEntryBy, location, data: JSON.parse(JSON.stringify(data)) }
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
        const result = await this.prisma.dailyMonitoring.findUnique({
            where: {
                uuid: uuid,
            },
        })
        console.log('result:', result)
        const finalData = result
        return finalData
    }

    async update(payload: UpdateMonitoringData) {
        const { uuid, dataEntryBy, location, data } = payload;
        const existing = await this.prisma.dailyMonitoring.findUnique({
            where: {
                uuid: uuid,
            },
        });

        if (!existing) throw new RpcException('Monitoring Data not found!');

        const existingData = JSON.parse(JSON.stringify(existing));

        const updatedMonitoringData = await this.prisma.dailyMonitoring.update({
            where: {
                uuid: uuid,
            },
            data: {
                dataEntryBy: dataEntryBy || existingData.dataEntryBy,
                location: location || existingData.location,
                source: data.source || existingData.data.source,
                data: { dataEntryBy, location, ...data } || existingData.data,
                updatedAt: new Date(),
            },
        });

        return updatedMonitoringData;

    }

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