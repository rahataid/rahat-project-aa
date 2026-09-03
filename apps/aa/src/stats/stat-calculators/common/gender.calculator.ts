import { StatCalcContext, StatCalculator } from '../types';

export const genderCalculator: StatCalculator = {
  key: 'BENEFICIARY_GENDER',
  async run({ prisma }: StatCalcContext) {
    const genderStats = await prisma.beneficiary.groupBy({
      by: ['gender'],
      _count: { gender: true },
    });

    const data = genderStats.map((stat) => ({
      id: stat.gender,
      count: stat._count.gender,
    }));
    return { name: 'beneficiary_gender', data, group: 'beneficiary' };
  },
};
