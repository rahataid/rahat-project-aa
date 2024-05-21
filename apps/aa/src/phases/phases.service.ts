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

  async getOne(payload: { uuid: string }) {
    const { uuid } = payload
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid
      },
      include: {
        triggers: true,
        activities: true
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

  async activatePhase(uuid: string) {
    return this.prisma.phases.update({
      where: {
        uuid: uuid
      },
      data: {
        isActive: true
      }
    })
  }

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

  async calculatePhaseActivities() {
    const phases = await this.prisma.phases.findMany()

    let activitiesStats = []
    for (const phase of phases) {
      const totalActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          isDeleted: false
        },
      })

      const totalCompletedActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          status: 'COMPLETED',
          isDeleted: false,
        },
      });

      const completedPercentage = totalCompletedActivities ? ((totalCompletedActivities / totalActivities) * 100).toFixed(2) : 0;

      activitiesStats.push({
        totalActivities,
        totalCompletedActivities,
        completedPercentage,
        phase
      })
    }
    return activitiesStats
  }

  async getStats() {
    const [phaseActivities] = await Promise.all([
      this.calculatePhaseActivities()
    ]);
    return {
      phaseActivities
    }
  }
}

