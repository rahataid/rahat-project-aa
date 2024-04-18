import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";
import { AddActivityData, GetActivitiesDto, RemoveActivityData } from "./dto";

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivitiesService {
    private readonly logger = new Logger(ActivitiesService.name);

    constructor(
        private prisma: PrismaService,
        private readonly configService: ConfigService
    ) { }

    async add(payload: AddActivityData) {
        return await this.prisma.activities.create({
            data: payload
        })
    }

    async getAll(payload: GetActivitiesDto) {
        const { page, perPage, title, category, hazardType, phase } = payload

        const query = {
            where: {
                isDeleted: false,
                ...(title && { title: { contains: title, mode: 'insensitive' } }),
                ...(category && { categoryId: category }),
                ...(hazardType && { hazardTypeId: hazardType }),
                ...(phase && { phaseId: phase }),
            },
            include: {
                category: true,
                hazardType: true,
                phase: true
            }
        }

        // if (title) {
        //     query.where['title'] = {
        //         contains: title
        //     }
        // }

        // if (category) {
        //     query.where['categoryId'] = category
        // }

        // if (hazardType) {
        //     query.where['hazardTypeId'] = hazardType
        // }

        // if (phase) {
        //     query.where['phaseId'] = phase
        // }

        return paginate(
            this.prisma.activities,
            query,
            {
                page,
                perPage
            }
        )
    }

    async remove(payload: RemoveActivityData) {
        return await this.prisma.activities.update({
            where: {
                uuid: payload.uuid
            },
            data: {
                isDeleted: true
            }
        })
    }

}

