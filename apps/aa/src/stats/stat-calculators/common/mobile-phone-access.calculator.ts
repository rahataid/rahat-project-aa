import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const mobilePhoneAccessCalculator: StatCalculator = {
  key: 'DO_YOU_HAVE_ACCESS_TO_MOBILE_PHONES',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'do_you_have_access_to_mobile_phones',
      ['yes', 'no']
    );

    return {
      name: 'do_you_have_access_to_mobile_phones',
      data,
      group: 'beneficiary',
    };
  },
};
