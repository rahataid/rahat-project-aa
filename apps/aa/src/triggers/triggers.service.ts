import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull';
import { AddDataSource, RemoveDataSource } from '../dto';
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
  ) { }

  /***********************
* Development Only
*************************/
  async dev(payload: AddDataSource) {
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

  async create(payload: AddDataSource) {
    if (!this.isValidDataSource(payload.dataSource)) {
      throw new RpcException('Please provide a valid data source!');
    }

    if (payload.dataSource === DATA_SOURCES.MANUAL) {
      return this.createManualTrigger(payload)
    }

    const dataSource = await this.prisma.triggers.findFirst({
      where: {
        dataSource: payload.dataSource,
        isDeleted: false
      }
    })

    if (dataSource) {
      throw new RpcException(`${payload.dataSource} has already been configued!`);
    }

    const sanitizedPayload: AddDataSource = {
      title: payload.title,
      dataSource: payload.dataSource,
      location: payload.location,
      hazardTypeId: payload.hazardTypeId,
      triggerStatement: payload.triggerStatement,
      phaseId: payload.phaseId,
      activities: payload.activities,
      // repeatEvery: "* * * * *", //every minute
      repeatEvery: "30000",
      // triggerActivity: ['EMAIL']
    }

    return this.scheduleJob(sanitizedPayload);
  }

  async remove(payload: RemoveDataSource) {
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

    const createData = {
      repeatKey: repeatKey,
      uuid: uuid,
      ...payload
    }

    return this.prisma.triggers.create({
      data: createData
    })
  } ƒ

  isValidDataSource(value: string) {
    return Object.values(DATA_SOURCES).includes(value);
  }
}
