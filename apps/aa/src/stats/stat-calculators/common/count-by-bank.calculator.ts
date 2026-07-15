import { BeneficiaryExtrasRecord, StatCalcContext, StatCalculator } from '../types';

function countByBank(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((result, current) => {
    const bankValue = current.extras?.bank_name;
    if (bankValue) {
      result[bankValue] = (result[bankValue] || 0) + 1;
    }
    return result;
  }, {} as Record<string, number>);
}

export const countByBankCalculator: StatCalculator = {
  key: 'BENEFICIARY_COUNTBYBANK',
  async run({ allExtras }: StatCalcContext) {
    const withBank = allExtras.filter((item) => item.extras?.bank_name);
    const bankCounts = countByBank(withBank);
    const data = Object.keys(bankCounts).map((id) => ({
      id,
      count: bankCounts[id],
    }));

    return { name: 'beneficiary_countByBank', data, group: 'beneficiary' };
  },
};
