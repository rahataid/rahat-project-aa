import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countNearestHealthFacility(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const value = current.extras?.distance_to_the_nearest_health_facility;
    if (value) {
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const nearestHealthFacilityCalculator: StatCalculator = {
  key: 'NEAREST_HEALTH_FACILITY',
  async run({ allExtras }: StatCalcContext) {
    const records = allExtras.filter(
      (item) => item.extras?.distance_to_the_nearest_health_facility,
    );
    const counts = countNearestHealthFacility(records);
    const data = Object.entries(counts).map(([key, count]) => ({
      id: key,
      count,
    }));

    return {
      name: 'distance_to_the_nearest_health_facility',
      data,
      group: 'beneficiary',
    };
  },
};
