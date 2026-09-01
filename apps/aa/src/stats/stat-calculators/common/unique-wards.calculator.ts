import { StatCalcContext, StatCalculator } from '../types';

export const uniqueWardsCalculator: StatCalculator = {
  key: 'UNIQUE_WARDS',
  async run({ allExtras }: StatCalcContext) {
    const data = Array.from(
      new Set(
        allExtras
          .map((item) => (item.extras as { ward_no?: number })?.ward_no)
          .filter((ward) => typeof ward === 'number')
      )
    )
      .sort((a, b) => a - b)
      .map((ward) => ({ ward }));

    return { name: 'unique_wards', data, group: 'wards' };
  },
};
