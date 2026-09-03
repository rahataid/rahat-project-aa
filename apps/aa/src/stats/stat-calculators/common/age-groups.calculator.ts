import { mapAgeGroupCounts } from '../../../utils';
import { StatCalcContext, StatCalculator } from '../types';

export const ageGroupsCalculator: StatCalculator = {
  key: 'BENEFICIARY_AGEGROUPS',
  async run({ allExtras }: StatCalcContext) {
    const ageGroupCounts = mapAgeGroupCounts(allExtras);
    const data = Object.keys(ageGroupCounts).map((id) => ({
      id,
      count: ageGroupCounts[id],
    }));

    return { name: 'beneficiary_ageGroups', data, group: 'beneficiary' };
  },
};
