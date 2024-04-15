export interface AddSchedule {
  uuid?: string;
  location: string;
  dataSource: string;
  dangerLevel: number;
  warningLevel: number;
  repeatEvery: number;
  triggerActivity: string;
}

export interface RemoveSchedule {
  repeatKey: string;
}

