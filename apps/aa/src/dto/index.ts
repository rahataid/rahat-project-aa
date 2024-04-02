export interface AddSchedule {
  dataSource: string;
  dangerLevel: number;
  warningLevel: number;
  repeatEvery: number;
  triggerActivity: string;
}

export interface RemoveSchedule {
  uuid: string;
}

