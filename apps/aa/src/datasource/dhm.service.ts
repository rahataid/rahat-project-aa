import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, TRIGGER_ACTIVITY } from '../constants';
import { AbstractSource } from './datasource.abstract';
import { DhmDataObject, WaterLevelRecord } from './dto';
import { ConfigService } from '@nestjs/config';
import { AddDataSource } from '../dto';
import { DateTime } from 'luxon'
import { PrismaService } from '@rumsan/prisma';


@Injectable()
export class DhmService implements AbstractSource {
  private readonly logger = new Logger(DhmService.name);

  constructor(
    private readonly httpService: HttpService,
    private eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) { }

  async criteriaCheck(payload: AddDataSource) {

    const dataSource = payload.dataSource;

    this.logger.log(`${dataSource}: monitoring`)

    const dataSourceURL = this.configService.get('DHM');
    const location = payload.location
    const waterLevelResponse = await this.getRiverStationData(dataSourceURL, payload);

    const waterLevelData = this.sortByDate(waterLevelResponse.data.results as DhmDataObject[])

    if (waterLevelData.length === 0) {
      this.logger.log(`${dataSource}: Water level data is not available.`);
      return;
    }

    // const recentWaterLevel = this.getRecentData(waterLevelData);
    const recentWaterLevel = waterLevelData[0]

    const currentLevel = recentWaterLevel.waterLevel;

    const warningLevel = payload.triggerStatement.warningLevel
      ? payload.triggerStatement.warningLevel
      : recentWaterLevel.warningLevel;

    const dangerLevel = payload.triggerStatement.dangerLevel
      ? payload.triggerStatement.dangerLevel
      : recentWaterLevel.dangerLevel;

    this.logger.log("##### WATER LEVEL INFO ########")
    this.logger.log(recentWaterLevel);
    this.logger.log(`warning level: ${warningLevel}`);
    this.logger.log(`danger level: ${dangerLevel}`);
    this.logger.log("###############################")

    // save to db
    await this.saveWaterLevelsData({
      dataSourceId: payload.uuid,
      data: recentWaterLevel
    })

    const warningLevelReached = this.compareWaterLevels(
      currentLevel,
      warningLevel
    );

    const dangerLevelReached = this.compareWaterLevels(
      currentLevel,
      dangerLevel
    );

    if (dangerLevelReached) {
      const dangerMessage = `${dataSource}:${location}: Water level has reached danger level.`;
      this.logger.log(dangerMessage);
      if (payload.triggerActivity.includes(TRIGGER_ACTIVITY.EMAIL)) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: dangerMessage,
          status: 'DANGER',
          location,
          dataSource,
          currentLevel,
          warningLevel,
          dangerLevel,
        });
      }
      return;
    }

    if (warningLevelReached) {
      const warningMessage = `${dataSource}:${location} :Water level has reached warning level.`;
      this.logger.log(warningMessage);
      if (payload.triggerActivity.includes(TRIGGER_ACTIVITY.EMAIL)) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: warningMessage,
          location,
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

  // getRecentData(data: DhmDataObject[]): DhmDataObject {
  //   // reduce to find the latest object based on createdOn timestamp
  //   return data.reduce((latestObject, currentObject) => {
  //     const currentTimestamp = new Date(currentObject.createdOn);
  //     const latestTimestamp = new Date(latestObject.createdOn);

  //     // timestamps comparison to find the latest one
  //     return currentTimestamp > latestTimestamp ? currentObject : latestObject;
  //   });
  // }

  compareWaterLevels(currentLevel: number, threshold: number) {
    if (currentLevel >= threshold) {
      return true;
    }
    return false;
  }

  async getRiverStations() {
    const dataSourceURL = this.configService.get('DHM');
    const riverStationsURL = `${dataSourceURL}/river-stations/?latest=true`
    const stations = await this.getData(riverStationsURL)
    return stations.data;
  }

  async getWaterLevels() {
    return this.prisma.sourceData.findMany({
      where: {
        dataSource: {
          dataSource: 'DHM',
          isActive: true
        }
      },
      include: {
        dataSource: {
          select: {
            triggerStatement: true,
            dataSource: true,
            location: true,
          }
        }
      },
      orderBy: {
        createdAt:'desc'
      }
    
    })
  }

  async getRiverStationData(url: string, payload: AddDataSource) {
    const riverURL = new URL(`${url}/river`);
    const title = payload.location;
    const intervals = this.getIntervals()
    const waterLevelOnGt = intervals.timeGT
    const waterLevelOnLt = intervals.timeLT

    riverURL.searchParams.append('title', title)
    riverURL.searchParams.append('historical', 'true')
    riverURL.searchParams.append('format', 'json')
    riverURL.searchParams.append('water_level_on__gt', waterLevelOnGt)
    riverURL.searchParams.append('water_level_on__lt', waterLevelOnLt)
    riverURL.searchParams.append('fields', 'id,created_on,title,basin,point,image,water_level,danger_level,warning_level,water_level_on,status,steady,description,station')
    riverURL.searchParams.append('limit', '-1')

    return this.httpService.axiosRef.get(riverURL.href);

  }

  async getData(url: string) {
    return this.httpService.axiosRef.get(url);
  }

  getIntervals() {
    const now = DateTime.now().setZone('Asia/Kathmandu')
    const pastThree = now.minus({ days: 1 })

    const midnightToday = now.set({ hour: 23, minute: 59, second: 59 }).toISO()
    const startPastThree = pastThree.set({ hour: 0, minute: 0, second: 0 }).toISO()

    return {
      timeGT: startPastThree,
      timeLT: midnightToday
    }
  }

  sortByDate(data: DhmDataObject[]) {
    return data.sort((a, b) => new Date(b.waterLevelOn).valueOf() - new Date(a.waterLevelOn).valueOf());
  }

  async saveWaterLevelsData(payload: WaterLevelRecord) {
    try {
      const recordExists = await this.prisma.sourceData.findFirst(({
        where: {
          dataSourceId: payload.dataSourceId,
          data: {
            path: ["waterLevelOn"],
            equals: payload.data.waterLevelOn
          }
        }
      }))
      if (!recordExists) {
        const x = await this.prisma.sourceData.create({
          data: {
            data: payload.data,
            dataSourceId: payload.dataSourceId
          }
        })
      }
    } catch (err) {
      console.log(err)
    }
  }
}
