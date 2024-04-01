export class AddSchedule {
  dataSource: string;
  dangerLevel: number;
  warningLevel: number;
  timeExpression: string;
  triggerActivity: string;
}

export interface BipadDataObject {
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
