import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countHouseType(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const value = current.extras?.type_of_house;
    if (value) {
      result[value] = (result[value] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const houseTypeCalculator: StatCalculator = {
  key: 'HOUSE_TYPE',
  async run({ allExtras }: StatCalcContext) {
    const counts = countHouseType(allExtras);
    const data = Object.entries(counts).map(([key, count]) => ({
      id: key,
      count,
    }));

    return {
      name: 'type_of_house',
      data,
      group: 'beneficiary',
    };
  },
};
