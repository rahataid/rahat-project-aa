import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countSafeWorkplace(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const value = current.extras?.is_workplace_safe_during_extreme_heat;
    if (value) {
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const safeWorkplaceCalculator: StatCalculator = {
  key: 'SAFE_WORKPLACE',
  async run({ allExtras }: StatCalcContext) {
    const records = allExtras.filter(
      (item) => item.extras?.is_workplace_safe_during_extreme_heat,
    );
    const counts = countSafeWorkplace(records);
    const data = Object.entries(counts).map(([key, count]) => ({
      id: key,
      count,
    }));

    return {
      name: 'is_workplace_safe_during_extreme_heat',
      data,
      group: 'beneficiary',
    };
  },
};
