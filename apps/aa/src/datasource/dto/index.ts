export interface GetWaterLevel {
  location: string;
  page: number;
  perPage: number;
}
export interface DhmDataObject {
  id: number;
  createdOn: string;
  title: string;
  basin: string;
  point: { [key: string]: any };
  waterLevel: number;
  image: string;
  dangerLevel: number;
  warningLevel: number;
  waterLevelOn: string;
  status: string;
  steady: string;
  description: string;
  station: number;
}

export interface GlofasStationInfo {
  LOCATION: string;
  I: string;
  J: string;
  URL: string;
  BBOX: string;
  TIMESTRING: string;
}

export interface GlofasDataObject {
  pointForecastData: {
    forecastDate: string;
    maxProbability: string;
    alertLevel: string;
    maxProbabilityStep: string;
    dischargeTendencyImage: string;
    peakForecasted: string;
  };
  hydrographImageUrl: string;
  returnPeriodData: Array<{
    forecastDay: string;
    forecastDate: string;
    forecastData: string;
  }>;
  forecastDate: string;
}