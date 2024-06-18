import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import {
  AddTriggerStatement,
  RemoveTriggerStatement,
  UpdateTriggerStatement,
} from '../dto';
import { randomUUID } from 'crypto';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { GetOneTrigger, GetTriggers } from './dto';
import { PhasesService } from '../phases/phases.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PhasesService))
    private readonly phasesService: PhasesService,
    @InjectQueue(BQUEUE.SCHEDULE) private readonly scheduleQueue: Queue,
    @InjectQueue(BQUEUE.TRIGGER) private readonly triggerQueue: Queue
  ) {}

  // dev only
  async dev(payload: AddTriggerStatement) {
    const all = await this.scheduleQueue.getRepeatableJobs();
    for (const job of all) {
      await this.scheduleQueue.removeRepeatableByKey(job.key);
    }
    return all;
  }
  // dev only end

  async getOne(payload: GetOneTrigger) {
    const { repeatKey } = payload;
    return this.prisma.triggers.findUnique({
      where: {
        repeatKey: repeatKey,
      },
      include: {
        phase: true
      }
    })
  }

  async getAll(payload: GetTriggers) {
    const { page, perPage, phaseId } = payload;

    return paginate(
      this.prisma.triggers,
      {
        where: {
          isDeleted: false,
          ...(phaseId && { phaseId }),
        },
        include: {
          phase: true,
        },
      },
      {
        page,
        perPage,
      }
    );
  }

  async create(payload: AddTriggerStatement) {
    if (!this.isValidDataSource(payload.dataSource)) {
      throw new RpcException('Please provide a valid data source!');
    }

    if (payload.dataSource === DATA_SOURCES.MANUAL) {
      return this.createManualTrigger(payload);
    }

    const sanitizedPayload: AddTriggerStatement = {
      title: payload.title,
      dataSource: payload.dataSource,
      location: payload.location,
      triggerStatement: payload.triggerStatement,
      phaseId: payload.phaseId,
      isMandatory: payload.isMandatory,
      repeatEvery: '30000',
    };

    return this.scheduleJob(sanitizedPayload);
  }

  async remove(payload: RemoveTriggerStatement) {
    const { repeatKey } = payload;
    const trigger = await this.prisma.triggers.findUnique({
      where: {
        repeatKey: repeatKey,
        isDeleted: false,
      },
      include: {phase: true}
    });
    if (!trigger)
      throw new RpcException(`Active trigger with id: ${repeatKey} not found.`);
    if (trigger.isTriggered)
      throw new RpcException(`Cannot remove an activated trigger.`);
    if(trigger.phase.isActive) throw new RpcException('Cannot remove triggers from an active phase.')

    const phaseDetail = await this.phasesService.getOne({
      uuid: trigger.phaseId
    })

    // check if optional triggers criterias are disrupted
    if(!trigger.isMandatory){
      const totalTriggersAfterDeleting = Number(phaseDetail.triggerRequirements.optionalTriggers.totalTriggers) - 1
      if(totalTriggersAfterDeleting<phaseDetail.requiredOptionalTriggers) {
        throw new RpcException('Trigger criterias disrupted.')
      }
    }

    // if(trigger.isMandatory){
    //   const totalTriggersAfterDeleting = Number(phaseDetail.triggerRequirements.mandatoryTriggers.totalTriggers) - 1
    //   if(totalTriggersAfterDeleting<phaseDetail.requiredMandatoryTriggers) {
    //     throw new RpcException('Trigger criterias disrupted.')
    //   }
    // }

    await this.scheduleQueue.removeRepeatableByKey(repeatKey);
    const updatedTrigger = await this.prisma.triggers.update({
      where: {
        repeatKey: repeatKey,
      },
      data: {
        isDeleted: true,
      },
    });

    if(trigger.isMandatory){
      await this.prisma.phases.update({
        where: {
          uuid: trigger.phaseId
        },
        data: {
          requiredMandatoryTriggers: {
            decrement: 1
          }
        }
      })
    }

    // if(!trigger.isMandatory){
    //   await this.prisma.phases.update({
    //     where: {
    //       uuid: trigger.phaseId
    //     },
    //     data: {
    //       requiredOptionalTriggers: {
    //         decrement: 1
    //       }
    //     }
    //   })
    // }
    
    this.triggerQueue.add(JOBS.TRIGGERS.REACHED_THRESHOLD, trigger, {
      attempts: 3,
      removeOnComplete: true,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    return updatedTrigger;
  }

  async archive(payload: RemoveTriggerStatement) {
    const { repeatKey } = payload;
    const trigger = await this.prisma.triggers.findUnique({
      where: {
        repeatKey: repeatKey,
        isDeleted: false,
      },
    });
    if (!trigger)
      throw new RpcException(`Active trigger with id: ${repeatKey} not found.`);

    await this.scheduleQueue.removeRepeatableByKey(repeatKey);
    const updatedTrigger = await this.prisma.triggers.update({
      where: {
        repeatKey: repeatKey,
      },
      data: {
        isDeleted: true,
      },
    });

    return updatedTrigger;
  }

  private async scheduleJob(payload) {
    const uuid = randomUUID();

    const { ...restOfPayload } = payload;

    const jobPayload = {
      ...restOfPayload,
      uuid,
    };

    const repeatable = await this.scheduleQueue.add(
      JOBS.SCHEDULE.ADD,
      jobPayload,
      {
        jobId: uuid,
        attempts: 3,
        removeOnComplete: false,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        repeat: {
          every: Number(payload.repeatEvery),
        },
      }
    );

    const repeatableKey = repeatable.opts.repeat.key;

    const createData = {
      repeatKey: repeatableKey,
      uuid: uuid,
      isDeleted: false,
      ...restOfPayload,
    };

    await this.prisma.triggers.create({
      data: {
        ...createData,
      },
    });

    return createData;
  }

  private async createManualTrigger(payload) {
    const uuid = randomUUID();
    const repeatKey = randomUUID();

    // const { activities, ...restData } = payload
    const { ...restData } = payload;

    const createData = {
      repeatKey: repeatKey,
      uuid: uuid,
      ...restData,
    };

    return this.prisma.triggers.create({
      data: {
        ...createData,
        // activities: {
        //   connect: payload.activities
        // }
      },
    });
  }

  async activateTrigger(payload: UpdateTriggerStatement) {
    const trigger = await this.prisma.triggers.findUnique({
      where: {
        repeatKey: payload?.repeatKey,
      },
    });

    if (!trigger) throw new RpcException('Trigger not found.');
    if (trigger.isTriggered)
      throw new RpcException('Trigger has already been activated.');
    if (trigger.dataSource !== DATA_SOURCES.MANUAL)
      throw new RpcException('Cannot activate an automated trigger.');

    const triggerDocs = payload?.triggerDocuments
      ? JSON.parse(JSON.stringify(payload.triggerDocuments))
      : [];

    const updatedTrigger = await this.prisma.triggers.update({
      where: {
        uuid: trigger.uuid,
      },
      data: {
        isTriggered: true,
        triggeredAt: new Date(),
        triggerDocuments: triggerDocs,
        notes: payload?.notes || '',
      },
    });

    if (trigger.isMandatory) {
      await this.prisma.phases.update({
        where: {
          uuid: trigger.phaseId,
        },
        data: {
          receivedMandatoryTriggers: {
            increment: 1,
          },
        },
      });
    }

    if (!trigger.isMandatory) {
      await this.prisma.phases.update({
        where: {
          uuid: trigger.phaseId,
        },
        data: {
          receivedOptionalTriggers: {
            increment: 1,
          },
        },
      });
    }

    this.triggerQueue.add(JOBS.TRIGGERS.REACHED_THRESHOLD, trigger, {
      attempts: 3,
      removeOnComplete: true,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    return updatedTrigger;
  }

  isValidDataSource(value: string) {
    return Object.values(DATA_SOURCES).includes(value);
  }
}
