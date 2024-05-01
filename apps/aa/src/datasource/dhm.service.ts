import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, TRIGGER_ACTIVITY } from '../constants';
import { AbstractSource } from './datasource.abstract';
import { DhmDataObject, GetWaterLevel, WaterLevelRecord } from './dto';
import { ConfigService } from '@nestjs/config';
import { AddDataSource } from '../dto';
import { DateTime } from 'luxon'
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { UUID } from 'crypto';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

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

    const readinessLevel = payload.triggerStatement.readinessLevel
      ? payload.triggerStatement.readinessLevel
      : recentWaterLevel.warningLevel;

    const activationLevel = payload.triggerStatement.activationLevel
      ? payload.triggerStatement.activationLevel
      : recentWaterLevel.dangerLevel;

    this.logger.log("##### WATER LEVEL INFO ########")
    this.logger.log(recentWaterLevel);
    this.logger.log(`readiness level: ${readinessLevel}`);
    this.logger.log(`activation level: ${activationLevel}`);
    this.logger.log("###############################")

    // save to db
    await this.saveWaterLevelsData({
      triggerId: payload.uuid,
      data: recentWaterLevel
    })

    const readinessLevelReached = this.compareWaterLevels(
      currentLevel,
      readinessLevel
    );

    const activationLevelReached = this.compareWaterLevels(
      currentLevel,
      activationLevel
    );

    await this.processTriggerStatus(payload.uuid, readinessLevelReached, activationLevelReached);

    if (activationLevelReached) {
      const dangerMessage = `${dataSource}:${location}: Water level has reached activation level.`;
      this.logger.log(dangerMessage);
      if (payload.triggerActivity.includes(TRIGGER_ACTIVITY.EMAIL)) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: dangerMessage,
          status: 'READINESS_LEVEL',
          location,
          dataSource,
          currentLevel,
          readinessLevel,
          activationLevel,
        });
      }
      return;
    }

    if (readinessLevelReached) {
      const warningMessage = `${dataSource}:${location} :Water level has reached readiness level.`;
      this.logger.log(warningMessage);
      if (payload.triggerActivity.includes(TRIGGER_ACTIVITY.EMAIL)) {
        this.eventEmitter.emit(EVENTS.WATER_LEVEL_NOTIFICATION, {
          message: warningMessage,
          location,
          status: 'ACTIVATION_LEVEL',
          dataSource,
          currentLevel,
          readinessLevel,
          activationLevel,
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

  async getWaterLevels(payload: GetWaterLevel) {
    const { page, perPage } = payload

    return paginate(
      this.prisma.triggersData,
      {
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
          createdAt: 'desc'
        }
      },
      {
        page,
        perPage
      }
    )
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
      const recordExists = await this.prisma.triggersData.findFirst(({
        where: {
          triggerId: payload.triggerId,
          data: {
            path: ["waterLevelOn"],
            equals: payload.data.waterLevelOn
          }
        }
      }))
      if (!recordExists) {
        await this.prisma.triggersData.create({
          data: {
            data: payload.data,
            triggerId: payload.triggerId
          }
        })
      }
    } catch (err) {
      this.logger.error(err);
    }
  }

  async processTriggerStatus(uuid: string, readinessLevelReached: boolean, activationLevelReached: boolean) {
    try {
      const dataSource = await this.prisma.triggers.findUnique({
        where: {
          uuid: uuid
        }
      })

      const date = new Date().toISOString()

      if (readinessLevelReached && !dataSource.readinessActivated) {
        await this.prisma.triggers.update({
          where: {
            uuid: uuid
          },
          data: {
            readinessActivated: true,
            readinessActivatedOn: date
          }
        })
      }


      if (activationLevelReached && !dataSource.activationActivated) {
        if (!dataSource.readinessActivated) {
          await this.prisma.triggers.update({
            where: {
              uuid: uuid
            },
            data: {
              readinessActivated: true,
              readinessActivatedOn: date
            }
          })
        }
        await this.prisma.triggers.update({
          where: {
            uuid: uuid
          },
          data: {
            activationActivated: true,
            activationActivatedOn: date
          }
        })
      }

    } catch (err) {
      console.log(err)
    }
  }

}
