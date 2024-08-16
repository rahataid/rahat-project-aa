export interface WaterLevelNotification {
  message: string;
  status: 'READINESS_LEVEL' | 'ACTIVATION_LEVEL';
  dataSource: string;
  currentLevel: number;
  readinessLevel: number;
  activationLevel: number;
}
