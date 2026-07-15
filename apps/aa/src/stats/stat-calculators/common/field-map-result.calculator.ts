import { countResult } from '../../../utils';
import { StatCalcContext, StatCalculator } from '../types';

export const fieldMapResultCalculator: StatCalculator = {
  key: 'FIELD_MAP_RESULT',
  async run({ allExtras }: StatCalcContext) {
    const data = countResult(allExtras);

    return { name: 'field_map_result', data, group: 'beneficiary' };
  },
};
