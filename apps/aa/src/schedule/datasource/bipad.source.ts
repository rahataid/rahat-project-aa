import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '../../constants';
import { AbstractSource } from '../abstract';
import { DATA_SOURCES_INFO } from '../db';
import { AddSchedule, BipadDataObject } from '../dto';

@Injectable()
export class BipadSource implements AbstractSource {
  private readonly logger = new Logger(BipadSource.name);

  constructor(
    private readonly httpService: HttpService,
    private eventEmitter: EventEmitter2
  ) {}

  async criteriaCheck(payload: AddSchedule) {
    const dataSource = payload.dataSource;
    const dataSourceInfo = DATA_SOURCES_INFO[dataSource];

    const dataSourceURL = dataSourceInfo.url;
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

    this.logger.log(recentWaterLevel);
    this.logger.log(`warning level: ${warningLevel}`);
    this.logger.log(`danger level: ${dangerLevel}`);

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
      this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
        message: dangerMessage,
        status: 'DANGER',
        dataSource,
        currentLevel,
        warningLevel,
        dangerLevel,
      });
      return;
    }

    if (warningLevelReached) {
      const warningMessage = `${dataSource}: Water level has reached warning level.`;
      this.logger.log(warningMessage);
      this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
        message: warningMessage,
        status: 'WARNING',
        dataSource,
        currentLevel,
        warningLevel,
        dangerLevel,
      });
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
