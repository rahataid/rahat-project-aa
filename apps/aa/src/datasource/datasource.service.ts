import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from '@nestjs/schedule';
import { SettingsService } from "@rumsan/settings";
import { DhmService } from "./dhm.service";
import { DhmDataObject } from "./dto";

@Injectable()
export class DataSourceService implements OnApplicationBootstrap {

    private readonly logger = new Logger(DataSourceService.name);

    constructor(
        private readonly dhmService: DhmService
    ) { }

    async onApplicationBootstrap() {
        this.synchronizeDHM()
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