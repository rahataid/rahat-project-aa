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

    @Cron('*/10 * * * * *')
    async synchronizeGlofas() {
        try {
            const { dateString, dateTimeString } = getFormattedGlofasDate()
            const glofasSettings = SettingsService.get('DATASOURCE.GLOFAS') as Omit<GlofasStationInfo, 'TIMESTRING'>;

            const hasExistingRecord = await this.glofasService.findGlofasDataByDate(glofasSettings.LOCATION, dateString)

            if (hasExistingRecord) {
                // this.logger.log(`Glofas data for the date ${dateString} already exists.`)
                return
            }

            const stationData = await this.glofasService.getStationData({ ...glofasSettings, TIMESTRING: dateTimeString })
            const reportingPoints = stationData?.content["Reporting Points"].point

            const glofasData = this.glofasService.parseGlofasData(reportingPoints)

            await this.glofasService.saveGlofasStationData(glofasSettings.LOCATION, glofasData)
        } catch (err) {
            this.logger.error("Sync Glofas", err.message)
        }
    }

    @Cron('*/60 * * * * *')
    async synchronizeDHM() {
        try {
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
            this.logger.error(err.message)
        }
    }


}