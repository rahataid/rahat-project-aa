import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const useDigitalWalletsCalculator: StatCalculator = {
  key: 'USE_DIGITAL_WALLETS',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'use_digital_wallets',
      ['yes', 'no']
    );

    return { name: 'use_digital_wallets', data, group: 'beneficiary' };
  },
};
