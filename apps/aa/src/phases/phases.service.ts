import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";
import { Phase } from "@prisma/client";

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

  async getStats() {
    const data = await this.prisma.activities.count({
      where: {
        isComplete: true
      },
            
    })
    return data
    // return this.prisma.phases.findMany()
  }
}

