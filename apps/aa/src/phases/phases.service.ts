import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";
import { DataSource, Phase } from "@prisma/client";
import { RpcException } from "@nestjs/microservices";

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

  async calculateActivitiesStats() {
    // const completedPreparednessActivity = await this.prisma.activities.count({
    //   where: {
    //     isComplete: true,
    //     phase: {
    //       name: Phase.PREPAREDNESS
    //     }
    //   },
    // })
    // const completedReadinessActivity = await this.prisma.activities.count({
    //   where: {
    //     isComplete: true,
    //     phase: {
    //       name: Phase.READINESS
    //     }
    //   },
    // })

    // const data = 

  }

  async getPhaseStatus() {
    const dhmStatus = await this.prisma.triggers.findFirst({
      where: {
        dataSource: DataSource.DHM,
        isActive: true
      }
    })

    let readinessStatus = {
      activated: false,
      activatedOn: null
    };

    let activationStatus = {
      activated: false,
      activatedOn: null
    }

    if (dhmStatus) {
      if (dhmStatus.readinessActivated) {
        readinessStatus = {
          activated: true,
          activatedOn: dhmStatus.readinessActivatedOn
        }
      }
      if (dhmStatus.activationActivated) {
        activationStatus = {
          activated: true,
          activatedOn: dhmStatus.activationActivatedOn
        }
      }
    }
    
    return {
      readinessStatus,
      activationStatus
    }
  }


  async getStats() {
    const [phaseStatus] =
      await Promise.all([
        this.getPhaseStatus()
      ]);


    return {
      phaseStatus
    }
  }
}

