import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";
import { StatsService } from "../stats";

@Injectable()
export class PhasesStatsService {
  private readonly logger = new Logger(PhasesStatsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly statsService: StatsService
  ) { }

  
  async calculatePhaseTriggeres(phaseId: string) {
    const phaseDetail = this.prisma.phases.findUnique({
        where: {
            uuid: phaseId
        }
    })
    const prevStats = this.statsService.findOne({
        name: 'phase_triggered'
    })
    console.log("prev stats", prevStats)
  }

  async calculatePhaseActivities() {
    const phases = await this.prisma.phases.findMany()

    let activitiesStats = []
    for (const phase of phases) {
      const totalActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          isDeleted: false
        },
      })

      const totalCompletedActivities = await this.prisma.activities.count({
        where: {
          phaseId: phase.uuid,
          status: 'COMPLETED',
          isDeleted: false,
        },
      });

      const completedPercentage = totalCompletedActivities ? ((totalCompletedActivities / totalActivities) * 100).toFixed(2) : 0;

      activitiesStats.push({
        totalActivities,
        totalCompletedActivities,
        completedPercentage,
        phase
      })
    }
    return activitiesStats
  }

  async getStats() {
    const [phaseActivities] = await Promise.all([
      this.calculatePhaseActivities()
    ]);
    return {
      phaseActivities
    }
  }

  async saveTriggerStats(phaseId: string){
    const data = this.calculatePhaseTriggeres(phaseId)

    await this.statsService.save({
        name: 'phase_triggered',
        group: 'phase',
        data: {}
    })
  }
}

