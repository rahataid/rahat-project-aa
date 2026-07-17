import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { StatDto } from './dto/stat.dto';
import { StatsService } from './stats.service';
import {
  resolveCalculators,
  StatCalcContext,
  UnknownStatTypeError,
} from './stat-calculators';

@Injectable()
export class StatsCalculationService {
  private readonly logger = new Logger(StatsCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
    private readonly settingsService: SettingsService
  ) {}

  // Resolves the current project's stat type from the PROJECTINFO setting
  // (value.PROJECT_TYPE, set once at project setup time — see
  // tools/deployment-scripts/0.setup-project.js). Returns null when it
  // can't be determined.
  async getStatType(): Promise<string | null> {
    try {
      const projectInfo = await this.settingsService.getPublic('PROJECTINFO');
      const statType = (projectInfo?.value as any)?.PROJECT_TYPE;
      return statType ? String(statType).toUpperCase() : null;
    } catch (error) {
      this.logger.warn(
        `Could not resolve PROJECT_TYPE from settings: ${
          (error as Error)?.message
        }`
      );
      return null;
    }
  }

  // Resolves the calculator set for the current (or given) stat type, runs
  // it, and saves the results. This is the single place that turns
  // "a project's beneficiaries changed" into "the right dashboard stats are
  // up to date" — see apps/aa/src/stats/stat-calculators for the registry.
  async runAndSave(statType?: string): Promise<StatDto[]> {
    const type = statType ?? (await this.getStatType());
    if (!type) {
      this.logger.warn('No stat type resolved, skipping stats calculation.');
      return [];
    }

    let calculators;
    try {
      calculators = resolveCalculators(type);
    } catch (error) {
      if (error instanceof UnknownStatTypeError) {
        this.logger.error(error.message);
        return [];
      }
      throw error;
    }

    const allExtras = await this.prisma.beneficiary.findMany({
      select: { extras: true },
    });
    const ctx: StatCalcContext = { prisma: this.prisma, allExtras };

    // One calculator failing (missing/malformed data, a bad query, etc.)
    // must not take the rest of the dashboard down with it — run them
    // independently and just skip whichever one(s) failed.
    const settled = await Promise.allSettled(
      calculators.map((c) => c.run(ctx))
    );

    const stats: StatDto[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        stats.push(...[result.value].flat());
      } else {
        this.logger.error(
          `Calculator "${
            calculators[i].key
          }" failed, skipping it for this run: ${
            (result.reason as Error)?.message ?? result.reason
          }`
        );
      }
    });

    if (!stats.length) {
      this.logger.warn(
        `No stats produced for stat type "${type}", skipping save.`
      );
      return [];
    }

    await this.statsService.saveMany(stats);

    return stats;
  }
}
