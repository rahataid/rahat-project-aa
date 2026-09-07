import { countBySSAType } from '../../../utils';
import { StatCalcContext, StatCalculator } from '../types';

export const typeOfSsaCalculator: StatCalculator = {
  key: 'TYPE_OF_SSA',
  async run({ allExtras }: StatCalcContext) {
    const counts = countBySSAType(allExtras);
    const data = Object.keys(counts).map((id) => ({ id, count: counts[id] }));

    return { name: 'type_of_ssa', data, group: 'beneficiary' };
  },
};
