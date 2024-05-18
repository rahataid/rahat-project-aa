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

  async getOne(payload) {
    const { uuid } = payload
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid
      },
      include: {
        triggers: true
      }
    })

    const totalMandatoryTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: true
      }
    })
    const totalOptionalTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: false
      }
    })

    const triggerRequirements = {
      mandatoryTriggers: {
        totalTriggers: totalMandatoryTriggers,
        requiredTriggers: phase.requiredMandatoryTriggers,
        receivedTriggers: phase.receivedMandatoryTriggers
      },
      optionalTriggers: {
        totalTriggers: totalOptionalTriggers,
        requiredTriggers: phase.requiredOptionalTriggers,
        receivedTriggers: phase.receivedOptionalTriggers
      }
    }

    return { ...phase, triggerRequirements }
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

  // async getPhaseStatus() {
  // const dhmStatus = await this.prisma.triggers.findFirst({
  //   where: {
  //     dataSource: DataSource.DHM,
  //     isDeleted: false
  //   }
  // })

  // let readinessStatus = {
  //   activated: false,
  //   activatedOn: null
  // };

  // let activationStatus = {
  //   activated: false,
  //   activatedOn: null
  // }

  // TODO: refactor this
  // if (dhmStatus) {
  //   if (dhmStatus.readinessActivated) {
  //     readinessStatus = {
  //       activated: true,
  //       activatedOn: dhmStatus.readinessActivatedOn
  //     }
  //   }
  //   if (dhmStatus.activationActivated) {
  //     activationStatus = {
  //       activated: true,
  //       activatedOn: dhmStatus.activationActivatedOn
  //     }
  //   }
  // }

  //   return {
  //     readinessStatus,
  //     activationStatus
  //   }
  // }


  async addTriggersToPhases(payload) {
    const { uuid, triggers, triggerRequirements } = payload
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid
      }
    })
    if (!phase) throw new RpcException('Phase not found.')
    if (phase.isActive) throw new RpcException('Cannot add triggers to an active phase.')

    for (const trigger of triggers) {
      const tg = await this.prisma.triggers.findUnique({ where: { repeatKey: trigger.repeatKey } })

      console.log("tg", tg);

      await this.prisma.triggers.update({
        where: {
          uuid: tg.uuid
        },
        data: {
          isMandatory: trigger.isMandatory,
          phaseId: phase.uuid
        }
      })
    }
    const updatedPhase = await this.prisma.phases.update({
      where: {
        uuid: phase.uuid
      },
      data: {
        requiredMandatoryTriggers: triggerRequirements.mandatoryTriggers.requiredTriggers,
        requiredOptionalTriggers: triggerRequirements.optionalTriggers.requiredTriggers
      }
    })

    return updatedPhase
  }
}

