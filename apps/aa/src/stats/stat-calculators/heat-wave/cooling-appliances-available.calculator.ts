import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countCoolingAppliances(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const value = current.extras?.cooling_appliances_available_at_home;
    if (value) {
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const coolingAppliancesAvailableCalculator: StatCalculator = {
  key: 'COOLING_APPLIANCES_AVAILABLE',
  async run({ allExtras }: StatCalcContext) {
    const records = allExtras.filter(
      (item) => item.extras?.cooling_appliances_available_at_home,
    );
    const counts = countCoolingAppliances(records);
    const data = Object.entries(counts).map(([key, count]) => ({
      id: key,
      count,
    }));

    return {
      name: 'cooling_appliances_available_at_home',
      data,
      group: 'beneficiary',
    };
  },
};
