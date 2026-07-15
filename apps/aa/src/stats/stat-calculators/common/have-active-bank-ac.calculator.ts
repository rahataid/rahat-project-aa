import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const haveActiveBankAcCalculator: StatCalculator = {
  key: 'HAVE_ACTIVE_BANK_AC',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'have_active_bank_ac',
      ['yes', 'no']
    );

    return { name: 'have_active_bank_ac', data, group: 'beneficiary' };
  },
};
