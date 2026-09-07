import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const internetAccessCalculator: StatCalculator = {
  key: 'DO_YOU_HAVE_ACCESS_TO_INTERNET',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'do_you_have_access_to_internet',
      ['yes', 'no']
    );

    return {
      name: 'do_you_have_access_to_internet',
      data,
      group: 'beneficiary',
    };
  },
};
