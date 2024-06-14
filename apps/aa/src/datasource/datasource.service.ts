import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from '@nestjs/schedule';
import { SettingsService } from "@rumsan/settings";
import { DhmService } from "./dhm.service";
import { DhmDataObject, GlofasStationInfo } from "./dto";
import { GlofasService } from "./glofas.service";
import { getFormattedGlofasDate } from "../utils/date";

@Injectable()
export class DataSourceService implements OnApplicationBootstrap {

    private readonly logger = new Logger(DataSourceService.name);

    constructor(
        private readonly dhmService: DhmService,
        private readonly glofasService: GlofasService
    ) { }

    async onApplicationBootstrap() {
        this.synchronizeDHM()
        this.synchronizeGlofas()
    }

    // run one time every hour
    @Cron('0 * * * *') 
    // @Cron('*/10 * * * * *') 
    async synchronizeGlofas() {
        try {
            this.logger.log("GLOFAS: syncing once every hour")
            const { dateString, dateTimeString } = getFormattedGlofasDate()
            const glofasSettings = SettingsService.get('DATASOURCE.GLOFAS') as Omit<GlofasStationInfo, 'TIMESTRING'>;

            const hasExistingRecord = await this.glofasService.findGlofasDataByDate(glofasSettings.LOCATION, dateString)

            if (hasExistingRecord) {
                return
            }

            const stationData = await this.glofasService.getStationData({ ...glofasSettings, TIMESTRING: dateTimeString })
            const reportingPoints = stationData?.content["Reporting Points"].point

            const glofasData = this.glofasService.parseGlofasData(reportingPoints)

            await this.glofasService.saveGlofasStationData(glofasSettings.LOCATION, { ...glofasData, forecastDate: dateString })
        } catch (err) {
            this.logger.error("GLOFAS Err:", err.message)
        }
    }


    @Cron('*/5 * * * *') //every five minutes
    async synchronizeDHM() {
        try {
            this.logger.log("DHM: syncing every five minutes")
            const dhmSettings = SettingsService.get('DATASOURCE.DHM');
            const location = dhmSettings['LOCATION']
            const dhmURL = dhmSettings['URL']

            const waterLevelResponse = await this.dhmService.getRiverStationData(dhmURL, location);

            const waterLevelData = this.dhmService.sortByDate(waterLevelResponse.data.results as DhmDataObject[])

            if (waterLevelData.length === 0) {
                this.logger.log(`DHM:${location}: Water level data is not available.`);
                return;
            }

            const recentWaterLevel = waterLevelData[0]
            await this.dhmService.saveWaterLevelsData(location, recentWaterLevel)
        } catch (err) {
            this.logger.error("DHM Err:", err.message)
        }
    }


}