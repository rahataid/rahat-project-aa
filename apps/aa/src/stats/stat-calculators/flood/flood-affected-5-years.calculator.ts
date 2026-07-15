import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const floodAffected5YearsCalculator: StatCalculator = {
  key: 'FLOOD_AFFECTED_IN_5_YEARS',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'flood_affected_in_5_years',
      ['yes', 'no']
    );

    return { name: 'flood_affected_in_5_years', data, group: 'beneficiary' };
  },
};
