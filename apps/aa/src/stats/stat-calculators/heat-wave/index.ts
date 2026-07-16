import { StatCalculator } from '../types';
import { COMMON_CALCULATORS } from '../common';
import { activitiesStatusCalculator } from './activities-status.calculator';
import { coolingAppliancesAvailableCalculator } from './cooling-appliances-available.calculator';
import { safeDrinkingWaterAtWorkCalculator } from './safe-drinking-water-at_work.calculator';
import { safeWorkplaceCalculator } from './safe-workplace.calculator';
import { nearestHealthFacilityCalculator } from './nearest-health_facility.calculator';
import { houseTypeCalculator } from './house-type.calculator';

export * from './activities-status.calculator';
export * from './cooling-appliances-available.calculator';
export * from './safe-drinking-water-at_work.calculator';
export * from './safe-workplace.calculator';
export * from './nearest-health_facility.calculator';
export * from './house-type.calculator';

export const HEAT_WAVE_CALCULATORS: StatCalculator[] = [
  ...COMMON_CALCULATORS,
  activitiesStatusCalculator,
  coolingAppliancesAvailableCalculator,
  safeDrinkingWaterAtWorkCalculator,
  safeWorkplaceCalculator,
  nearestHealthFacilityCalculator,
  houseTypeCalculator,
];
