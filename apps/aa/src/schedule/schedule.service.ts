import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull';
import { AddSchedule, RemoveSchedule } from '../dto';
import { randomUUID } from 'crypto';
import { PrismaService } from '@rumsan/prisma';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(BQUEUE.SCHEDULE) private readonly scheduleQueue: Queue,
  ) { }

  async getAll() {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        isActive: true
      }
    })
    return schedules
  }

  async create(payload: AddSchedule) {
    switch (payload.dataSource) {
      case DATA_SOURCES.BIPAD:
        return this.scheduleJob(payload);
      default:
        throw new RpcException('Please provide a valid data source!');
    }
  }

  async remove(payload: RemoveSchedule) {
    const { uuid } = payload
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        uuid: uuid,
        isActive: true
      }
    })
    if (!schedule) throw new RpcException(`Active schedule with id: ${uuid} not found.`)
    await this.scheduleQueue.removeRepeatableByKey(uuid)
    const updated = await this.prisma.schedule.update({
      where: {
        uuid: uuid
      },
      data: {
        isActive: false
      }
    })
    return updated
  }

  async scheduleJob(payload: AddSchedule) {
    const uuid = randomUUID()

    const repeatable = await this.scheduleQueue.add(JOBS.SCHEDULE.ADD, payload, {
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
      uuid: repeatableKey,
      isActive: true,
      ...payload
    }
    await this.prisma.schedule.create({
      data: createData
    })

    return createData
  }
}
