export interface WaterLevelNotification {
  message: string;
  status: 'WARNING' | 'DANGER';
  dataSource: string;
  currentLevel: number;
  warningLevel: number;
  dangerLevel: number;
}
