import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const ssaRecipientCalculator: StatCalculator = {
  key: 'SSA_RECIPIENT_IN_HH',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'ssa_recipient_in_hh',
      ['yes', 'no']
    );

    return { name: 'ssa_recipient_in_hh', data, group: 'beneficiary' };
  },
};
