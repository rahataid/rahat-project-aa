import { StatCalculator } from '../types';
import { COMMON_CALCULATORS } from '../common';
import { activitiesStatusCalculator } from './activities-status.calculator';

export * from './activities-status.calculator';

export const HEAT_WAVE_CALCULATORS: StatCalculator[] = [
  ...COMMON_CALCULATORS,
  activitiesStatusCalculator,
];
