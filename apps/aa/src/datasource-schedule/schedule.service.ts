import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull';
import { AddDataSource, RemoveDataSource } from '../dto';
import { randomUUID } from 'crypto';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { GetSchedule } from './dto';
// import { GlofasService } from '../datasource/glofas.service';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

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

  async getAll(payload: GetSchedule) {
    const { page, perPage } = payload
    return paginate(
      this.prisma.dataSources,
      {
        where: {
          isActive: true
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

    const sanitizedPayload: AddDataSource = {
      dataSource: payload.dataSource,
      location: payload.location,
      hazardTypeId: payload.hazardTypeId,
      triggerStatement: payload.triggerStatement,
      repeatEvery: Number(payload.repeatEvery),
      triggerActivity: payload.triggerActivity
    }

    return this.scheduleJob(sanitizedPayload);
  }

  async remove(payload: RemoveDataSource) {
    const { repeatKey } = payload
    const schedule = await this.prisma.dataSources.findUnique({
      where: {
        repeatKey: repeatKey,
        isActive: true
      }
    })
    if (!schedule) throw new RpcException(`Active schedule with id: ${repeatKey} not found.`)
    await this.scheduleQueue.removeRepeatableByKey(repeatKey)
    const updated = await this.prisma.dataSources.update({
      where: {
        repeatKey: repeatKey
      },
      data: {
        isActive: false
      }
    })
    return updated
  }

  async scheduleJob(payload: AddDataSource) {
    const uuid = randomUUID()

    const jobPayload = {
      ...payload,
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
        every: payload.repeatEvery, //in ms, 5s
      }
    });

    const repeatableKey = repeatable.opts.repeat.key;

    const createData = {
      repeatKey: repeatableKey,
      uuid: uuid,
      isActive: true,
      ...payload
    }

    await this.prisma.dataSources.create({
      data: createData
    })

    return createData
  }

  isValidDataSource(value: string) {
    return Object.values(DATA_SOURCES).includes(value);
  }
}
