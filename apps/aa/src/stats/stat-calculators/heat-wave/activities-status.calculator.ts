import { StatCalcContext, StatCalculator } from '../types';

export const activitiesStatusCalculator: StatCalculator = {
  key: 'ACTIVITIES_STATUS',
  async run({ prisma }: StatCalcContext) {
    const statusCounts = await prisma.activities.groupBy({
      by: ['status'],
      where: { isDeleted: false },
      _count: { status: true },
    });

    const data = statusCounts.map((stat) => ({
      id: stat.status,
      count: stat._count.status,
    }));

    return { name: 'activities_status', data, group: 'activities' };
  },
};
