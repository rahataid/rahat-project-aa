import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AbstractSource } from './datasource.abstract';
import { DhmDataObject, GetWaterLevel } from './dto';
import { ConfigService } from '@nestjs/config';
import { AddTriggerStatement } from '../dto';
import { DateTime } from 'luxon'
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class DhmService implements AbstractSource {
  private readonly logger = new Logger(DhmService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private prisma: PrismaService,
  ) { }

  async criteriaCheck(payload: AddTriggerStatement) {

    const triggerData = await this.prisma.triggers.findUnique({
      where: {
        uuid: payload.uuid
      }
    })

    // do not process if it is already triggered
    if (triggerData.isTriggered) return

    const dataSource = payload.dataSource;
    const location = payload.location;

    this.logger.log(`${dataSource}: monitoring`)

    const recentData = await this.prisma.sourcesData.findFirst({
      where: {
        location,
        source: dataSource,
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!recentData) {
      this.logger.error(`${dataSource}:${location} : data not available`)
      return
    }

    const recentWaterLevel = JSON.parse(JSON.stringify(recentData.data)) as DhmDataObject
    const currentLevel = recentWaterLevel.waterLevel;


    this.logger.log("##### WATER LEVEL INFO ########")
    this.logger.log('Latest water level: ', recentWaterLevel);
    this.logger.log("##############################")

    if (payload.triggerStatement?.readinessLevel) {
      const readinessLevelReached = this.compareWaterLevels(
        currentLevel,
        payload.triggerStatement?.readinessLevel
      );
      if (readinessLevelReached) {
        // send emails here

        this.logger.log('Readiness level reached.');
        return
      }
    }

    if (payload.triggerStatement?.activationLevel) {
      const activationLevelReached = this.compareWaterLevels(
        currentLevel,
        payload.triggerStatement?.activationLevel
      );
      if (activationLevelReached) {
        // send emails here
        this.logger.log('Activation level reached.');
        return
      }
    }
    this.logger.log(`${dataSource}: Water is in a safe level.`);
    return;
  }

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
    return "ok"
    // const { page, perPage } = payload
    // return paginate(
    //   this.prisma.triggersData,
    //   {
    //     where: {
    //       trigger: {
    //         dataSource: 'DHM',
    //         isDeleted: false
    //       }
    //     },
    //     include: {
    //       trigger: {
    //         select: {
    //           triggerStatement: true,
    //           dataSource: true,
    //           location: true,
    //         }
    //       }
    //     },
    //     orderBy: {
    //       createdAt: 'desc'
    //     }
    //   },
    //   {
    //     page,
    //     perPage
    //   }
    // )
  }

  async getRiverStationData(url: string, location: string) {
    const riverURL = new URL(`${url}/river`);
    const title = location;
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
  async saveWaterLevelsData(location: string, payload: DhmDataObject) {
    try {
      const recordExists = await this.prisma.sourcesData.findFirst(({
        where: {
          source: 'DHM',
          location: location,
          data: {
            path: ["waterLevelOn"],
            equals: payload.waterLevelOn
          }
        }
      }))
      if (!recordExists) {
        await this.prisma.sourcesData.create({
          data: {
            source: 'DHM',
            location: location,
            data: JSON.parse(JSON.stringify(payload)),
          }
        })
      }
    } catch (err) {
      this.logger.error(err);
    }
  }
}
