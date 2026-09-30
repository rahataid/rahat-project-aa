import { StatCalcContext, StatCalculator } from '../types';

export const totalFamilyMembersCalculator: StatCalculator = {
  key: 'TOTAL_NUMBER_FAMILY_MEMBERS',
  async run({ allExtras }: StatCalcContext) {
    const count = allExtras.reduce((sum, ben) => {
      const extras = ben.extras as { total_number_of_family_members?: number };
      const members = Number(extras?.total_number_of_family_members || 0);
      return sum + members;
    }, 0);

    return {
      name: 'total_number_family_members',
      data: { count },
      group: 'beneficiary',
    };
  },
};
