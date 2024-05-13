export interface GetWaterLevel {
  page: number;
  perPage: number;
}
export interface WaterLevelRecord {
  triggerId: string;
  data: Record<string,any>
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
