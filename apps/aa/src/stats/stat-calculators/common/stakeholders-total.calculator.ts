import { StatCalcContext, StatCalculator } from '../types';

export const stakeholdersTotalCalculator: StatCalculator = {
  key: 'STAKEHOLDERS_TOTAL',
  async run({ prisma }: StatCalcContext) {
    const count = await prisma.stakeholders.count({
      where: { isDeleted: false },
    });

    return { name: 'stakeholders_total', data: { count }, group: 'stakeholders' };
  },
};
