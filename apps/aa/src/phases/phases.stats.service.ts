import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { StatsService } from '../stats';

@Injectable()
export class PhasesStatsService {
  private readonly logger = new Logger(PhasesStatsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly statsService: StatsService
  ) {}

  async savePhaseActivatedStats(phaseId: string) {
    const phaseDetail = await this.prisma.phases.findUnique({
      where: {
        uuid: phaseId,
      },
    });
	
	const statName = (`${phaseDetail.name}_phase_activated`).toUpperCase()

    const prevStats = await this.statsService.findOne({
      name: statName,
    });


    // intitial record
    if (!prevStats) {
      await this.statsService.save({
        name: statName,
        group: 'phase',
        data: {
          activationHistory: [
            { phase: phaseDetail.name, activatedAt: phaseDetail.activatedAt },
          ],
          count: 1,
        },
      });
      return;
    }

    const prevStatsData = JSON.parse(JSON.stringify(prevStats.data));

    const newActivationStats = {
      activationHistory: [
        ...prevStatsData.activationHistory,
        { phase: phaseDetail.name, activatedAt: phaseDetail.activatedAt },
      ],
      count: Number(prevStatsData.count) + 1,
    };

    await this.statsService.save({
      name: statName,
      group: 'phase',
      data: newActivationStats,
    });

    return;
  }

  async savePhaseRevertStats(payload: { phaseId: string; revertedAt: string }) {
    const { phaseId, revertedAt } = payload;
    const phaseDetail = await this.prisma.phases.findUnique({
      where: {
        uuid: phaseId,
      },
    });

	const statName = (`${phaseDetail.name}_phase_reverted`).toUpperCase()

    const prevStats = await this.statsService.findOne({
      name: statName
    });

    // intitial record
    if (!prevStats) {
      await this.statsService.save({
        name: statName,
        group: 'phase',
        data: {
          revertHistory: [{ phase: phaseDetail.name, revertedAt }],
          count: 1,
        },
      });
      return;
    }

    const prevStatsData = JSON.parse(JSON.stringify(prevStats.data));

    const newRevertStats = {
		revertHistory: [
        ...prevStatsData.revertHistory,
        { phase: phaseDetail.name, revertedAt },
      ],
      count: Number(prevStatsData.count) + 1,
    };

    await this.statsService.save({
      name: statName,
      group: 'phase',
      data: newRevertStats,
    });

    return;
  }

  async calculatePhaseActivities() {
    const phases = await this.prisma.phases.findMany();

    let activitiesStats = [];
    for (const phase of phases) {
      const totalActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          isDeleted: false,
        },
      });

      const totalCompletedActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          status: 'COMPLETED',
          isDeleted: false,
        },
      });

      const completedPercentage = totalCompletedActivities
        ? ((totalCompletedActivities / totalActivities) * 100).toFixed(2)
        : 0;

      activitiesStats.push({
        totalActivities,
        totalCompletedActivities,
        completedPercentage,
        phase,
      });
    }

    await this.statsService.save({
      name: 'ACTIVITIES',
      group: 'activities',
      data: activitiesStats
    })

    return;
  }

  async getStats() {
    const phaseActivities = await this.statsService.findOne({
      name: 'ACTIVITIES'
    })
 
    return {
      phaseActivities,
    };
  }
}
