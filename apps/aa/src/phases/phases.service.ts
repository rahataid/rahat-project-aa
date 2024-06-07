import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";
import { RpcException } from "@nestjs/microservices";
import { InjectQueue } from "@nestjs/bull";
import { BQUEUE, JOBS } from "../constants";
import { Queue } from "bull";
import { BeneficiaryService } from "../beneficiary/beneficiary.service";
import { TriggersService } from "../triggers/triggers.service";

@Injectable()
export class PhasesService {
  private readonly logger = new Logger(PhasesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly beneficiaryService: BeneficiaryService,
    private readonly triggerService: TriggersService,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    @InjectQueue(BQUEUE.COMMUNICATION) private readonly communicationQueue: Queue,
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
        triggers: {
          where: {
            isDeleted: false
          },
          include: {
            phase: true
          }
        },
        activities: true,
      }
    })

    const totalMandatoryTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: true,
        isDeleted: false
      }
    })
    const totalOptionalTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: false,
        isDeleted: false
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
    const phaseDetails = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid
      },
      include: {
        activities: {
          where: {
            isAutomated: true,
            status: {
              not: 'COMPLETED'
            }
          }
        }
      }
    })

    const phaseActivities = phaseDetails.activities;
    for (const activity of phaseActivities) {
      const activityComms = JSON.parse(JSON.stringify(activity.activityCommunication))
      for (const comm of activityComms) {
        this.communicationQueue.add(JOBS.COMMUNICATION.TRIGGER, comm?.campaignId, {
          attempts: 3,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        });
      }
      await this.prisma.activities.update({
        where: {
          uuid: activity.uuid
        },
        data: {
          status: 'COMPLETED'
        }
      })
    }

    if (phaseDetails.canTriggerPayout) {
      const allBenfs = await this.beneficiaryService.getAllBenfs()
      allBenfs?.forEach((benf, i) => {
        if (benf.benTokens) {
          this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, {
            benTokens: benf.benTokens,
            wallet: benf.walletAddress
          }, {
            attempts: 3,
            removeOnComplete: true,
            backoff: {
              type: 'exponential',
              delay: i * 500,
            },
          });
        }
      })
    }

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

  async revertPhase(payload) {
    const { phaseId } = payload
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: phaseId
      },
      include: {
        triggers: {
          where: {
            isDeleted: false
          }
        }
      }
    })

    if (!phase) throw new RpcException('Phase not found.')

    if (!phase.triggers.length || !phase.isActive || !phase.canRevert) throw new RpcException('Phase cannot be reverted.');

    for (const trigger of phase.triggers) {
      const { repeatKey } = trigger
      if (trigger.dataSource === 'MANUAL') {
        await this.triggerService.create({
          title: trigger.title,
          dataSource: trigger.dataSource,
          isMandatory: trigger.isMandatory,
          phaseId: trigger.phaseId,
          hazardTypeId: trigger.hazardTypeId
        })
      } else {
        await this.triggerService.create({
          title: trigger.title,
          dataSource: trigger.dataSource,
          location: trigger.location,
          triggerStatement: JSON.parse(JSON.stringify(trigger.triggerStatement)),
          isMandatory: trigger.isMandatory,
          phaseId: trigger.phaseId,
          hazardTypeId: trigger.hazardTypeId
        })
      }

      await this.triggerService.remove({
        repeatKey
      })
    }

    const updatedPhase = await this.prisma.phases.update({
      where: {
        uuid: phaseId
      },
      data: {
        receivedMandatoryTriggers: 0,
        receivedOptionalTriggers: 0,
        isActive: false
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

