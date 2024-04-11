import { HttpService } from "@nestjs/axios";
import { AbstractSource } from "./datasource.abstract";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { AddSchedule } from "../dto";
import { Logger } from "@nestjs/common";
import { fetchWeatherApi } from "openmeteo";

export class GlofasService implements AbstractSource {
    private readonly logger = new Logger(GlofasService.name);

    constructor(
        private readonly httpService: HttpService,
        private eventEmitter: EventEmitter2,
        private readonly configService: ConfigService
    ) { }

    async criteriaCheck(payload: AddSchedule) {
        const dataSource = payload.dataSource;

        this.logger.log(`${dataSource}: monitoring`)

        const params = {
            "latitude": 28.64,
            "longitude": 81.29,
            "daily": "river_discharge"
        };
        const url = "https://flood-api.open-meteo.com/v1/flood";
        const responses = await fetchWeatherApi(url, params);

        // Helper function to form time ranges
        const range = (start: number, stop: number, step: number) =>
            Array.from({ length: (stop - start) / step }, (_, i) => start + i * step);

        // Process first location. Add a for-loop for multiple locations or weather models
        const response = responses[0];

        // Attributes for timezone and location
        const utcOffsetSeconds = response.utcOffsetSeconds();
        // const timezone = response.timezone();
        // const timezoneAbbreviation = response.timezoneAbbreviation();
        // const latitude = response.latitude();
        // const longitude = response.longitude();

        const daily = response.daily()!;



        // console.log(new Date(
        //     (Number(daily.time()) + utcOffsetSeconds) * 1000
        // ))

        // Note: The order of weather variables in the URL query and the indices below need to match!
        const weatherData = {
            daily: {
                time: range(Number(daily.time()), Number(daily.timeEnd()), daily.interval()).map(
                    (t) => new Date((t + utcOffsetSeconds) * 1000)
                ),
                riverDischarge: daily.variables(0)!.valuesArray()!,
            },

        };

        // `weatherData` now contains a simple structure with arrays for datetime and weather data
        for (let i = 0; i < weatherData.daily.time.length; i++) {
            console.log(
                weatherData.daily.time[i].toISOString(),
                weatherData.daily.riverDischarge[i]
            );
        }


        return "OK"
    }
}

