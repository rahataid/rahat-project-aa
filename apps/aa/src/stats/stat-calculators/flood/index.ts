import { StatCalculator } from '../types';
import { COMMON_CALCULATORS } from '../common';
import { floodAffected5YearsCalculator } from './flood-affected-5-years.calculator';

export const FLOOD_CALCULATORS: StatCalculator[] = [
  ...COMMON_CALCULATORS,
  floodAffected5YearsCalculator,
];
