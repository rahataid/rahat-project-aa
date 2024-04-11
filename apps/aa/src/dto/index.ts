export interface AddSchedule {
  location: string;
  dataSource: string;
  dangerLevel: number;
  warningLevel: number;
  repeatEvery: number;
  triggerActivity: string;
}

export interface RemoveSchedule {
  uuid: string;
}

