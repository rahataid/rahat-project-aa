import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull';
import { AddTriggerStatement, RemoveTriggerStatement, UpdateTriggerStatement } from '../dto';
import { randomUUID } from 'crypto';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { GetOneTrigger, GetTriggers } from './dto';
// import { GlofasService } from '../datasource/glofas.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(
    private prisma: PrismaService,
    // private readonly glofasService: GlofasService,
    @InjectQueue(BQUEUE.SCHEDULE) private readonly scheduleQueue: Queue,
    @InjectQueue(BQUEUE.TRIGGER) private readonly triggerQueue: Queue,
  ) { }

  /***********************
* Development Only
*************************/
  async dev(payload: AddTriggerStatement) {
    const all = await this.scheduleQueue.getRepeatableJobs()
    // console.log(all)
    // await this.scheduleQueue.removeRepeatableByKey('aa.jobs.schedule.add:8a8a552f-f516-4442-a7d6-8a3bd967c12b::5555555')
    // console.log(all)
    for (const job of all) {
      await this.scheduleQueue.removeRepeatableByKey(job.key)
    }
    return all
  }
  /***********************
* Development Only
*************************/

  async getOne(payload: GetOneTrigger) {
    // console.log(payload)
    const { repeatKey } = payload
    return this.prisma.triggers.findUnique({
      where: {
        repeatKey: repeatKey
      },
      include: {
        activities: true,
        hazardType: true,
        phase: true
      }
    })
  }

  async getAll(payload: GetTriggers) {
    const { page, perPage } = payload

    // this.prisma.triggers.findMany({
    //   where: {
    //     isDeleted:false
    //   }
    // })

    return paginate(
      this.prisma.triggers,
      {
        where: {
          isDeleted: false
        },
        include: {
          hazardType: true,
          activities: true,
          phase: true
        }
      },
      {
        page,
        perPage
      }
    )
  }

  async create(payload: AddTriggerStatement) {
    if (!this.isValidDataSource(payload.dataSource)) {
      throw new RpcException('Please provide a valid data source!');
    }

    if (payload.dataSource === DATA_SOURCES.MANUAL) {
      return this.createManualTrigger(payload)
    }

    const readinessLevelInput = payload.triggerStatement && 'readinessLevel' in payload.triggerStatement;
    const activationLevelInput = payload.triggerStatement && 'activationLevel' in payload.triggerStatement;

    if (readinessLevelInput && payload.dataSource === 'DHM') {
      const readinessExists = await this.prisma.triggers.findFirst({
        where: {
          dataSource: payload.dataSource,
          location: payload.location,
          triggerStatement: {
            path: ['readinessLevel'],
            not: null
          },
          isDeleted: false
        }
      })
      if (readinessExists) throw new RpcException(`${payload.dataSource} already configured for readiness level.`)
    }

    if (activationLevelInput && payload.dataSource === 'DHM') {
      const activationExists = await this.prisma.triggers.findFirst({
        where: {
          dataSource: payload.dataSource,
          location: payload.location,
          triggerStatement: {
            path: ['activationLevel'],
            not: null
          },
          isDeleted: false
        }
      })
      if (activationExists) throw new RpcException(`${payload.dataSource} already configured for activation level.`)
    }

    // if (dataSource) {
    //   throw new RpcException(`${payload.dataSource} has already been configued!`);
    // }

    const sanitizedPayload: AddTriggerStatement = {
      title: payload.title,
      dataSource: payload.dataSource,
      location: payload.location,
      hazardTypeId: payload.hazardTypeId,
      triggerStatement: payload.triggerStatement,
      phaseId: payload.phaseId,
      activities: payload.activities,
      repeatEvery: "30000",
    }

    return this.scheduleJob(sanitizedPayload);
  }

  async remove(payload: RemoveTriggerStatement) {
    const { repeatKey } = payload
    const schedule = await this.prisma.triggers.findUnique({
      where: {
        repeatKey: repeatKey,
        isDeleted: false
      }
    })
    if (!schedule) throw new RpcException(`Active schedule with id: ${repeatKey} not found.`)
    await this.scheduleQueue.removeRepeatableByKey(repeatKey)
    const updated = await this.prisma.triggers.update({
      where: {
        repeatKey: repeatKey
      },
      data: {
        isDeleted: true
      }
    })
    return updated
  }

  async scheduleJob(payload) {
    const uuid = randomUUID()

    const { activities, ...restOfPayload } = payload

    const jobPayload = {
      ...restOfPayload,
      uuid
    }

    const repeatable = await this.scheduleQueue.add(JOBS.SCHEDULE.ADD, jobPayload, {
      jobId: uuid,
      attempts: 3,
      removeOnComplete: false,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      repeat: {
        every: Number(payload.repeatEvery)
      }
    });

    const repeatableKey = repeatable.opts.repeat.key;

    const createData = {
      repeatKey: repeatableKey,
      uuid: uuid,
      isDeleted: false,
      ...restOfPayload
    }

    await this.prisma.triggers.create({
      data: {
        ...createData,
        activities: {
          connect: activities
        }
      }
    })

    return createData
  }

  async createManualTrigger(payload) {
    const uuid = randomUUID()
    const repeatKey = randomUUID()

    const { activities, ...restData } = payload

    const createData = {
      repeatKey: repeatKey,
      uuid: uuid,
      ...restData
    }

    return this.prisma.triggers.create({
      data: {
        ...createData,
        activities: {
          connect: payload.activities
        }
      }
    })
  }

  async activateTrigger(payload: UpdateTriggerStatement) {
    const trigger = await this.prisma.triggers.findUnique({
      where: {
        repeatKey: payload?.repeatKey
      }
    })

    if (!trigger) throw new RpcException('Trigger not found.')
    if (trigger.isTriggered) throw new RpcException('Trigger has already been activated.')
    if (trigger.dataSource !== DATA_SOURCES.MANUAL) throw new RpcException('Cannot activate an automated trigger.')

    const triggerDocs = payload?.triggerDocuments ? JSON.parse(JSON.stringify(payload.triggerDocuments)) : []

    const updatedTrigger = await this.prisma.triggers.update({
      where: {
        uuid: trigger.uuid
      },
      data: {
        isTriggered: true,
        triggerDocuments: triggerDocs,
        notes: payload?.notes || ""
      }
    })

    if (trigger.isMandatory) {
      await this.prisma.phases.update({
        where: {
          uuid: trigger.phaseId
        },
        data: {
          receivedMandatoryTriggers: {
            increment: 1
          }
        }
      })
    }

    if (!trigger.isMandatory) {
      await this.prisma.phases.update({
        where: {
          uuid: trigger.phaseId
        },
        data: {
          receivedOptionalTriggers: {
            increment: 1
          }
        }
      })
    }

    await this.triggerQueue.add(JOBS.TRIGGERS.REACHED_THRESHOLD, trigger, {
      attempts: 3,
      removeOnComplete: true,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    return updatedTrigger
  }

  isValidDataSource(value: string) {
    return Object.values(DATA_SOURCES).includes(value);
  }
}
