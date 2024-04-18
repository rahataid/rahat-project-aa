import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";

@Injectable()
export class PhasesService {
    private readonly logger = new Logger(PhasesService.name);

    constructor(
        private prisma: PrismaService,
        private readonly configService: ConfigService
    ) { }

    async getAll() {
      return this.prisma.phases.findMany()
    }
}

