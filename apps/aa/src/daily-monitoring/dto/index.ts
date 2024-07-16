interface Source {
  source?: string;
}
interface DHM extends Source {
  forecast?: string;
  today?: string;
  tomorrow?: string;
  dayAfterTomorrow?: string;
  todayAfternoon?: string;
  todayNight?: string;
  tomorrowAfternoon?: string;
  tomorrowNight?: string;
  dayAfterTomorrowAfternoon?: string;
  dayAfterTomorrowNight?: string;
  waterLevel?: string;
  hours24NWP?: string;
  hours48?: string;
  hours72NWP?: string;
}
interface GLOFAS extends Source {
  todayGLOFAS?: string;
  days3?: string;
  days5?: string;
  inBetweenTodayUntil7DaysIsThereAnyPossibilityOfPeak?: string;
}
interface NCMWRFAccumulated extends Source {
  heavyRainfallForecastInKarnaliBasin?: string;
  hours24?: string;
  hours72?: string;
  hours168?: string;
}
interface NCMWRFDeterministicAndProbabilistic extends Source {
  extremeWeatherOutlook?: string;
  deterministicsPredictionSystem?: string;
  probabilisticPredictionSystem?: string;
}
interface FlashFloodRiskMonitoring extends Source {
  status?: string;
}
export interface AddDailyMonitoringData extends Source {
  dataEntryBy: string;
  location: string;
  data: Array<
    | DHM
    | GLOFAS
    | NCMWRFAccumulated
    | NCMWRFDeterministicAndProbabilistic
    | FlashFloodRiskMonitoring
  >;
}
export interface GetDailyMonitoringData {
  page: number;
  perPage: number;
  dataEntryBy?: string;
  location?: string;
  createdAt?: string;
}
export interface GetOneMonitoringData {
  uuid: string;
}
export interface UpdateMonitoringData {
  uuid: string;
  dataEntryBy?: string;
  location?: string;
  data?:
    | DHM
    | GLOFAS
    | NCMWRFAccumulated
    | NCMWRFDeterministicAndProbabilistic
    | FlashFloodRiskMonitoring;
}
export interface RemoveMonitoringData {
  uuid: string;
}
