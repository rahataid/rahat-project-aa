import { StatCalcContext, StatCalculator } from '../types';

export const totalRespondentsCalculator: StatCalculator = {
  key: 'TOTAL_RESPONDENTS',
  async run({ prisma }: StatCalcContext) {
    const count = await prisma.beneficiary.count({
      where: { deletedAt: null },
    });

    return { name: 'total_respondents', data: { count }, group: 'beneficiary' };
  },
};
