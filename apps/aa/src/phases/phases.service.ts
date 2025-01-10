import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { RpcException } from '@nestjs/microservices';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, EVENTS, JOBS } from '../constants';
import { Queue } from 'bull';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { TriggersService } from '../triggers/triggers.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getTriggerAndActivityCompletionTimeDifference } from '../utils/timeDifference';

const BATCH_SIZE = 20;

@Injectable()
export class PhasesService {
  private readonly logger = new Logger(PhasesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly beneficiaryService: BeneficiaryService,
    @Inject(forwardRef(() => TriggersService))
    private readonly triggerService: TriggersService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(BQUEUE.CONTRACT) private readonly contractQueue: Queue,
    @InjectQueue(BQUEUE.COMMUNICATION)
    private readonly communicationQueue: Queue
  ) {}

  async getAll() {
    return this.prisma.phases.findMany();
  }

  async getOne(payload: { uuid: string }) {
    const { uuid } = payload;
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid,
      },
      include: {
        triggers: {
          where: {
            isDeleted: false,
          },
          include: {
            phase: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        },
        activities: true,
      },
    });

    const totalMandatoryTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: true,
        isDeleted: false,
      },
    });
    const totalOptionalTriggers = await this.prisma.triggers.count({
      where: {
        phaseId: phase.uuid,
        isMandatory: false,
        isDeleted: false,
      },
    });

    const triggerRequirements = {
      mandatoryTriggers: {
        totalTriggers: totalMandatoryTriggers,
        requiredTriggers: phase.requiredMandatoryTriggers,
        receivedTriggers: phase.receivedMandatoryTriggers,
      },
      optionalTriggers: {
        totalTriggers: totalOptionalTriggers,
        requiredTriggers: phase.requiredOptionalTriggers,
        receivedTriggers: phase.receivedOptionalTriggers,
      },
    };

    return { ...phase, triggerRequirements };
  }

  async activatePhase(uuid: string) {
    const phaseDetails = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid,
      },
      include: {
        activities: {
          where: {
            isAutomated: true,
            status: {
              not: 'COMPLETED',
            },
            isDeleted: false,
          },
        },
      },
    });

    const phaseActivities = phaseDetails.activities;
    for (const activity of phaseActivities) {
      const activityComms = JSON.parse(
        JSON.stringify(activity.activityCommunication)
      );
      for (const comm of activityComms) {
        this.communicationQueue.add(
          JOBS.ACTIVITIES.COMMUNICATION.TRIGGER,
          {
            communicationId: comm?.communicationId,
            activityId: activity?.uuid,
          },
          {
            attempts: 3,
            removeOnComplete: true,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          }
        );
      }
      await this.prisma.activities.update({
        where: {
          uuid: activity.uuid,
        },
        data: {
          status: 'COMPLETED',
        },
      });
    }

    if (phaseDetails.canTriggerPayout) {
      const allBenfs = await this.beneficiaryService.getCount();
      const batches = this.createBatches(allBenfs, BATCH_SIZE);

      if (batches.length) {
        batches?.forEach((batch) => {
          this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, batch, {
            attempts: 3,
            removeOnComplete: true,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          });
        });
      }
    }

    const updatedPhase = await this.prisma.phases.update({
      where: {
        uuid: uuid,
      },
      data: {
        isActive: true,
        activatedAt: new Date(),
      },
    });

    // event to calculate reporting
    this.eventEmitter.emit(EVENTS.PHASE_ACTIVATED, {
      phaseId: phaseDetails.uuid,
    });

    return updatedPhase;
  }

  async addTriggersToPhases(payload) {
    const { uuid, triggers, triggerRequirements } = payload;
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: uuid,
      },
    });
    if (!phase) throw new RpcException('Phase not found.');
    if (phase.isActive)
      throw new RpcException('Cannot add triggers to an active phase.');

    for (const trigger of triggers) {
      const tg = await this.prisma.triggers.findUnique({
        where: { repeatKey: trigger.repeatKey },
      });

      await this.prisma.triggers.update({
        where: {
          uuid: tg.uuid,
        },
        data: {
          isMandatory: trigger.isMandatory,
          phaseId: phase.uuid,
        },
      });
    }
    const updatedPhase = await this.prisma.phases.update({
      where: {
        uuid: phase.uuid,
      },
      data: {
        requiredMandatoryTriggers:
          triggerRequirements.mandatoryTriggers.requiredTriggers,
        requiredOptionalTriggers:
          triggerRequirements.optionalTriggers.requiredTriggers,
      },
    });

    return updatedPhase;
  }

  async revertPhase(payload) {
    const activitiesCompletedBeforePhaseActivated =
      await this.prisma.activities.findMany({
        where: {
          differenceInTriggerAndActivityCompletion: null,
          status: 'COMPLETED',
          isDeleted: false,
        },
        include: {
          phase: true,
        },
      });

    for (const activity of activitiesCompletedBeforePhaseActivated) {
      const timeDifference = getTriggerAndActivityCompletionTimeDifference(
        activity.phase.activatedAt,
        activity.completedAt
      );
      await this.prisma.activities.update({
        where: {
          uuid: activity.uuid,
        },
        data: {
          differenceInTriggerAndActivityCompletion: timeDifference,
        },
      });
    }

    const { phaseId } = payload;
    const phase = await this.prisma.phases.findUnique({
      where: {
        uuid: phaseId,
      },
      include: {
        triggers: {
          where: {
            isDeleted: false,
          },
        },
      },
    });

    if (!phase) throw new RpcException('Phase not found.');

    if (!phase.triggers.length || !phase.isActive || !phase.canRevert)
      throw new RpcException('Phase cannot be reverted.');

    for (const trigger of phase.triggers) {
      const { repeatKey } = trigger;
      if (trigger.dataSource === 'MANUAL') {
        await this.triggerService.create({
          title: trigger.title,
          dataSource: trigger.dataSource,
          isMandatory: trigger.isMandatory,
          phaseId: trigger.phaseId,
        });
      } else {
        await this.triggerService.create({
          title: trigger.title,
          dataSource: trigger.dataSource,
          location: trigger.location,
          triggerStatement: JSON.parse(
            JSON.stringify(trigger.triggerStatement)
          ),
          isMandatory: trigger.isMandatory,
          phaseId: trigger.phaseId,
        });
      }

      await this.triggerService.archive({
        repeatKey,
      });
    }

    const currentDate = new Date();

    const updatedPhase = await this.prisma.phases.update({
      where: {
        uuid: phaseId,
      },
      data: {
        receivedMandatoryTriggers: 0,
        receivedOptionalTriggers: 0,
        isActive: false,
        activatedAt: null,
        updatedAt: currentDate,
      },
    });

    this.eventEmitter.emit(EVENTS.PHASE_REVERTED, {
      phaseId: phase.uuid,
      revertedAt: currentDate.toISOString(),
    });

    return updatedPhase;
  }

  createBatchesOld(total: number, batchSize: number) {
    const batches = [];
    let start = 1;

    while (start <= total) {
      const end = Math.min(start + batchSize - 1, total);
      batches.push({
        size: end - start + 1,
        start: start,
        end: end,
      });
      start = end + 1;
    }

    return batches;
  }

  createBatches(total: number, batchSize: number, start = 1) {
    const batches: { size: number; start: number; end: number }[] = [];
    let elementsRemaining = total; // Track remaining elements to batch

    while (elementsRemaining > 0) {
      const end = start + Math.min(batchSize, elementsRemaining) - 1;
      const currentBatchSize = end - start + 1;

      batches.push({
        size: currentBatchSize,
        start: start,
        end: end,
      });

      elementsRemaining -= currentBatchSize; // Subtract batched elements
      start = end + 1; // Move start to the next element
    }

    return batches;
  }
}
