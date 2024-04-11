import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE, DATA_SOURCES, JOBS } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull';
import { AddSchedule, RemoveSchedule } from '../dto';
import { randomUUID } from 'crypto';
import { PrismaService } from '@rumsan/prisma';
// import { GlofasService } from '../datasource/glofas.service';

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
  async dev(payload: AddSchedule) {
    const all = await this.scheduleQueue.getRepeatableJobs()
    console.log(all)
    await this.scheduleQueue.removeRepeatableByKey('aa.jobs.schedule.add:8a8a552f-f516-4442-a7d6-8a3bd967c12b::5555555')
    // console.log(all)
    // for(const job of all){
    //   await this.scheduleQueue.removeRepeatableByKey(job.key)
    // }
    return all
  }
  /***********************
* Development Only
*************************/

  async getAll() {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        isActive: true
      }
    })
    return schedules
  }

  async create(payload: AddSchedule) {
    if (!this.isValidDataSource(payload.dataSource)) {
      throw new RpcException('Please provide a valid data source!');
    }

    const sanitizedPayload: AddSchedule = {
      dataSource: payload.dataSource,
      location: payload.location,
      dangerLevel: Number(payload.dangerLevel),
      warningLevel: Number(payload.warningLevel),
      repeatEvery: Number(payload.repeatEvery),
      triggerActivity: payload.triggerActivity
    }

    return this.scheduleJob(sanitizedPayload);
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

  isValidDataSource(value: string) {
    return Object.values(DATA_SOURCES).includes(value);
  }
}
