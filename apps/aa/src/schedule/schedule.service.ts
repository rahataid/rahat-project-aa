import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AbstractSource } from './abstract';
import { BipadSource } from './datasource';
import { DATA_SOURCES } from '../constants';
import { AddSchedule } from './dto';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly schedulerRegitry: SchedulerRegistry,
    private readonly bipadSource: BipadSource
  ) {}

  async create(payload: AddSchedule) {
    switch (payload.dataSource) {
      case DATA_SOURCES.BIPAD:
        return this.scheduleJob(payload, this.bipadSource);

      default:
        // throw new Error('Please provide a valid data source!');
        throw new RpcException(
          new BadRequestException('Please provide a valid data source!')
        );
    }
  }

  async scheduleJob(payload: AddSchedule, dataSource: AbstractSource) {
    try {
      this.schedulerRegitry.addCronJob(
        payload.dataSource,
        new CronJob(
          payload.timeExpression,
          () => {
            dataSource.criteriaCheck(payload);
          },
          () => {
            this.logger.log(`${payload.dataSource} execution stopped.`);
          },
          true
        )
      );
      return {
        success: true,
        message: `${payload.dataSource} is now being monitored.`,
      };
    } catch (err) {
      this.logger.error(err);
      throw new Error('An error occured.');
    }
  }
}
