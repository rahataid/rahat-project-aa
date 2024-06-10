import { AbstractSource } from "./datasource.abstract";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { AddTriggerStatement } from "../dto";
import { Injectable, Logger } from "@nestjs/common";
import { GlofasDataObject, GlofasStationInfo } from "./dto";
import { HttpService } from "@nestjs/axios";
import * as cheerio from 'cheerio';
import { dataLength } from "ethers";
import { PrismaService } from "@rumsan/prisma";
import { SettingsService } from "@rumsan/settings";
import { BQUEUE, JOBS } from "../constants";
import { Queue } from "bull";
import { InjectQueue } from "@nestjs/bull";

@Injectable()
export class GlofasService implements AbstractSource {
    private readonly logger = new Logger(GlofasService.name);

    constructor(
        private readonly httpService: HttpService,
        private prisma: PrismaService,
        @InjectQueue(BQUEUE.TRIGGER) private readonly triggerQueue: Queue,

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
        const probability = Number(payload.triggerStatement?.probability)

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

        const recentStationData = JSON.parse(JSON.stringify(recentData.data)) as GlofasDataObject
        const rpTable = recentStationData.returnPeriodTable;

        const maxLeadTimeDays = Number(payload?.triggerStatement?.maxLeadTimeDays)
        const latestForecastData = rpTable.returnPeriodData[0]

        const [latestForecastDay] = latestForecastData[0].split('-').slice(-1)
        const sanitizedForecastDay = Number(latestForecastDay)

        const minForecastDayIndex = rpTable.returnPeriodHeaders.indexOf(sanitizedForecastDay.toString());
        const maxForecastDayIndex = minForecastDayIndex + Number(maxLeadTimeDays)

        const indexRange = this.createRange(minForecastDayIndex + 1, maxForecastDayIndex)

        const probabilityReached = this.checkProbability(indexRange, latestForecastData, probability)

        if (probabilityReached) {
            if (payload.isMandatory) {
                await this.prisma.phases.update({
                    where: {
                        uuid: payload.phaseId
                    },
                    data: {
                        receivedMandatoryTriggers: {
                            increment: 1
                        }
                    }
                })
            }

            if (!payload.isMandatory) {
                await this.prisma.phases.update({
                    where: {
                        uuid: payload.phaseId
                    },
                    data: {
                        receivedOptionalTriggers: {
                            increment: 1
                        }
                    }
                })
            }

            await this.prisma.triggers.update({
                where: {
                    uuid: payload.uuid
                },
                data: {
                    isTriggered: true
                }
            })

            console.log("trigger updated");
            console.log("reached probabiliy called");

            this.triggerQueue.add(JOBS.TRIGGERS.REACHED_THRESHOLD, payload, {
                attempts: 3,
                removeOnComplete: true,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
            });

            return
        }


    }

    async getStationData(payload: GlofasStationInfo) {
        const glofasURL = new URL(payload.URL);

        const queryParams = {
            SERVICE: "WMS",
            VERSION: "1.3.0",
            REQUEST: "GetFeatureInfo",
            FORMAT: "image/png",
            TRANSPARENT: "true",
            QUERY_LAYERS: "reportingPoints",
            LAYERS: "reportingPoints",
            INFO_FORMAT: "application/json",
            WIDTH: "832",
            HEIGHT: "832",
            CRS: "EPSG:3857",
            STYLES: "",
            BBOX: payload.BBOX,
            I: payload.I,
            J: payload.J,
             TIME: payload.TIMESTRING,
            // BBOX: '9914392.14877593,2400326.5202299603,12627804.736861974,5113739.108316004',
            // I: '108',
            // J: '341',
            // TIME: "2024-06-09T00:00:00"
        };

        for (const [key, value] of Object.entries(queryParams)) {
            glofasURL.searchParams.append(key, value);
        }

        return (await this.httpService.axiosRef.get(glofasURL.href)).data;
    }

    async saveGlofasStationData(location: string, payload: GlofasDataObject) {
        try {
            const recordExists = await this.prisma.sourcesData.findFirst(({
                where: {
                    source: 'GLOFAS',
                    location: location,
                    data: {
                        path: ["forecastDate"],
                        equals: payload.forecastDate
                    }
                }
            }))

            if (!recordExists) {
                await this.prisma.sourcesData.create({
                    data: {
                        source: 'GLOFAS',
                        location: location,
                        data: JSON.parse(JSON.stringify(payload)),
                    }
                })
            }
        } catch (err) {
            this.logger.error(err);
        }
    }

    parseGlofasData(content: string) {
        const $ = cheerio.load(content);

        // 2 yr return period table
        const rpTable = $(
            'table[class="table-forecast-result table-forecast-result-global"][summary="ECMWF-ENS > 2 yr RP"]'
        );

        // point forecast table
        const pfTable = $('table.tbl_info_point[summary="Point Forecast"]');

        const hydrographElement = $('.forecast_images').find('img[alt="Discharge Hydrograph (ECMWF-ENS)"]');

        if (rpTable.length === 0 || pfTable.length === 0 || hydrographElement.length === 0) {
            this.logger.error("Target element not found");
            return;
        }

        const returnPeriodTable = this.parseReturnPeriodTable(rpTable, $)
        const pointForecastData = this.parsePointForecast(pfTable, $)
        const hydrographImageUrl = hydrographElement.attr('src');

        return {
            returnPeriodTable,
            pointForecastData,
            hydrographImageUrl
        }
    }

    parseReturnPeriodTable(rpTable: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI) {
        // first header row, consists of column names
        const headerRow = rpTable.find("tr").first();
        // get column names (th elements in tr)
        const returnPeriodHeaders = headerRow
            .find("th")
            .map((_, element) => $(element).text().trim())
            .toArray();


        // first 5 data row (excluding the header) , data from latest day
        const dataRow = rpTable.find("tr").slice(1, 6);
        const returnPeriodData = [];

        for (const row of dataRow) {
            const dataValues = $(row)
                .find("td")
                .map((_, element) => $(element).text().trim())
                .toArray();

            returnPeriodData.push(dataValues)
        }

        return { returnPeriodData, returnPeriodHeaders }
    }

    parsePointForecast(pfTable: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI) {
        const headerRow = pfTable.find('tr').first();
        const columnNames = headerRow.find('th').map((i, element) => $(element).text().trim()).toArray();

        const dataRow = pfTable.find('tr').eq(1);

        const forecastDate = dataRow.find('td:nth-child(1)').text().trim(); // Using nth-child selector
        const maxProbability = dataRow.find('td:nth-child(2)').text().trim();
        const alertLevel = dataRow.find('td:nth-child(3)').text().trim();
        const maxProbabilityStep = dataRow.find('td:nth-child(4)').text().trim();
        const dischargeTendencyImage = dataRow.find('td:nth-child(5) img').attr('src'); // Extract image src
        const peakForecasted = dataRow.find('td:nth-child(6)').text().trim();

        return {
            forecastDate: {
                header: columnNames[0],
                data: forecastDate
            },
            maxProbability: {
                header: columnNames[1],
                data: maxProbability
            },
            alertLevel: {
                header: columnNames[2],
                data: alertLevel
            },
            maxProbabilityStep: {
                header: columnNames[3],
                data: maxProbabilityStep
            },
            dischargeTendencyImage: {
                header: columnNames[4],
                data: dischargeTendencyImage
            },
            peakForecasted: {
                header: columnNames[5],
                data: peakForecasted
            }
        }
    }

    async findGlofasDataByDate(location: string, forecastDate: string) {
        const recordExists = await this.prisma.sourcesData.findFirst(({
            where: {
                source: 'GLOFAS',
                location: location,
                data: {
                    path: ["forecastDate"],
                    equals: forecastDate
                }
            }
        }))
        return recordExists
    }

    async getLatestWaterLevels() {
        const glofasSettings = SettingsService.get('DATASOURCE.GLOFAS') as GlofasStationInfo
        return this.prisma.sourcesData.findFirst({
            where: {
                source: 'GLOFAS',
                location: glofasSettings.LOCATION
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    }

    checkProbability(indexRange: number[], latestForecastData: any, probability: number) {
        for (const index of indexRange) {
            const forecastData = Number(latestForecastData[index])

            if (forecastData && forecastData >= probability) {
                return true
            }
        }
    }

    createRange(start: number, end: number) {
        const rangeArray = [];
        for (let i = start; i <= end; i++) {
            rangeArray.push(i);
        }
        return rangeArray;
    }

}