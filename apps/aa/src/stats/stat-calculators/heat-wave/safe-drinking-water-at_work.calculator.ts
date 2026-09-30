import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countSafeDrinkingWater(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const value = current.extras?.safe_drinking_water_available_at_work;
    if (value) {
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const safeDrinkingWaterAtWorkCalculator: StatCalculator = {
  key: 'SAFE_DRINKING_WATER_AT_WORK',
  async run({ allExtras }: StatCalcContext) {
    const records = allExtras.filter(
      (item) => item.extras?.safe_drinking_water_available_at_work,
    );
    const counts = countSafeDrinkingWater(records);
    const data = Object.entries(counts).map(([key, count]) => ({
      id: key,
      count,
    }));

    return {
      name: 'safe_drinking_water_available_at_work',
      data,
      group: 'beneficiary',
    };
  },
};
