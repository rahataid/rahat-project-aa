import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";
import { AddActivityCategory, GetActivityCategory, RemoveActivityCategory } from './dto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ActivityCategoriesService {
    private readonly logger = new Logger(ActivityCategoriesService.name);

    constructor(
        private prisma: PrismaService,
        private readonly configService: ConfigService
    ) { }

    async add(payload: AddActivityCategory) {
        return await this.prisma.activityCategories.create({
            data: payload
        })
    }

    async getAll(payload: GetActivityCategory) {
        const { page, perPage, name } = payload

        const query = {
            where: {
                isDeleted: false,
                ...(name && { name: { contains: name, mode: 'insensitive' } })
            }
        }

        return paginate(
            this.prisma.activityCategories,
            query,
            {
                page,
                perPage
            }
        )
    }

    async remove(payload: RemoveActivityCategory) {
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

