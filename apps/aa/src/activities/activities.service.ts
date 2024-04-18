import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";

@Injectable()
export class ActivitiesService {
    private readonly logger = new Logger(ActivitiesService.name);

    constructor(
        private prisma: PrismaService,
        private readonly configService: ConfigService
    ) { }

    async getAll() {
        return await this.prisma.activities.findMany();
    }

    async remove(data: { uuid: string }) {
        return await this.prisma.activities.update({
            where: {
                uuid: data.uuid
            },
            data: {
                isDeleted: true
            }
        })
    }

}

