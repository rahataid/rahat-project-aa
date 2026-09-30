import { countExtrasFieldValuesNormalized } from '../helpers';
import { StatCalcContext, StatCalculator } from '../types';

export const receiveDisasterInfoCalculator: StatCalculator = {
  key: 'RECEIVE_DISASTER_INFO',
  async run({ allExtras }: StatCalcContext) {
    const data = countExtrasFieldValuesNormalized(
      allExtras,
      'receive_disaster_info',
      ['yes', 'no']
    );

    return { name: 'receive_disaster_info', data, group: 'beneficiary' };
  },
};
