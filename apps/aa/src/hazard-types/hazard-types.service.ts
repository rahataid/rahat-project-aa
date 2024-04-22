import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PaginatorTypes, PrismaService, paginator } from "@rumsan/prisma";

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class HazardTypesService {
    private readonly logger = new Logger(HazardTypesService.name);

    constructor(
        private prisma: PrismaService,
        private readonly configService: ConfigService
    ) { }

    async getAll() {
      return this.prisma.hazardTypes.findMany()
    }
}

