import { StatCalculator } from '../types';
import { COMMON_CALCULATORS } from '../common';
import { activitiesStatusCalculator } from './activities-status.calculator';
import { coolingAppliancesAvailableCalculator } from './cooling-appliances-available.calculator';
import { safeDrinkingWaterAtWorkCalculator } from './safe-drinking-water-at_work.calculator';
import { safeWorkplaceCalculator } from './safe-workplace.calculator';
import { nearestHealthFacilityCalculator } from './nearest-health_facility.calculator';
import { houseTypeCalculator } from './house-type.calculator';

export const HEAT_WAVE_CALCULATORS: StatCalculator[] = [
  ...COMMON_CALCULATORS,
  activitiesStatusCalculator,
  coolingAppliancesAvailableCalculator,
  safeDrinkingWaterAtWorkCalculator,
  safeWorkplaceCalculator,
  nearestHealthFacilityCalculator,
  houseTypeCalculator,
];
