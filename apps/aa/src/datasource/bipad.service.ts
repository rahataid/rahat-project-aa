import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, TRIGGER_ACTIVITY } from '../constants';
import { AbstractSource } from './datasource.abstract';
import { BipadDataObject } from './dto';
import { ConfigService } from '@nestjs/config';
import { AddSchedule } from '../dto';


@Injectable()
export class BipadService implements AbstractSource {
  private readonly logger = new Logger(BipadService.name);

  constructor(
    private readonly httpService: HttpService,
    private eventEmitter: EventEmitter2,
    private readonly configService: ConfigService
  ) { }

  async criteriaCheck(payload: AddSchedule) {

    const dataSource = payload.dataSource;
    const dataSourceURL = this.configService.get(dataSource);
    const waterLevelResponse = await this.getData(dataSourceURL);

    const waterLevelData = waterLevelResponse.data.results as BipadDataObject[];

    if (waterLevelData.length === 0) {
      this.logger.log(`${dataSource}: Water level data is not available.`);
      return;
    }

    const recentWaterLevel = this.getRecentData(waterLevelData);

    const currentLevel = recentWaterLevel.waterLevel;

    const warningLevel = payload.warningLevel
      ? payload.warningLevel
      : recentWaterLevel.warningLevel;

    const dangerLevel = payload.dangerLevel
      ? payload.dangerLevel
      : recentWaterLevel.dangerLevel;

    this.logger.log("##### WATER LEVEL INFO ########")
    this.logger.log(recentWaterLevel);
    this.logger.log(`warning level: ${warningLevel}`);
    this.logger.log(`danger level: ${dangerLevel}`);
    this.logger.log("###############################")


    const warningLevelReached = this.compareWaterLevels(
      currentLevel,
      warningLevel
    );

    const dangerLevelReached = this.compareWaterLevels(
      currentLevel,
      dangerLevel
    );

    if (dangerLevelReached) {
      const dangerMessage = `${dataSource}: Water level has reached danger level.`;
      this.logger.log(dangerMessage);
      if (payload.triggerActivity === TRIGGER_ACTIVITY.EMAIL) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: dangerMessage,
          status: 'DANGER',
          dataSource,
          currentLevel,
          warningLevel,
          dangerLevel,
        });
      }
      return;
    }

    if (warningLevelReached) {
      const warningMessage = `${dataSource}: Water level has reached warning level.`;
      this.logger.log(warningMessage);
      if (payload.triggerActivity === TRIGGER_ACTIVITY.EMAIL) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: warningMessage,
          status: 'WARNING',
          dataSource,
          currentLevel,
          warningLevel,
          dangerLevel,
        });
      }
      return;
    }
    this.logger.log(`${dataSource}: Water is in a safe level.`);
    return;
  }

  getRecentData(data: BipadDataObject[]): BipadDataObject {
    // reduce to find the latest object based on createdOn timestamp
    return data.reduce((latestObject, currentObject) => {
      const currentTimestamp = new Date(currentObject.createdOn);
      const latestTimestamp = new Date(latestObject.createdOn);

      // timestamps comparison to find the latest one
      return currentTimestamp > latestTimestamp ? currentObject : latestObject;
    });
  }

  compareWaterLevels(currentLevel: number, threshold: number) {
    if (currentLevel >= threshold) {
      return true;
    }
    return false;
  }

  async getData(url: string) {
    return this.httpService.axiosRef.get(url);
  }
}
