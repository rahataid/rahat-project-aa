import { Injectable } from '@nestjs/common';
import { StatsCalculationService } from '../stats';

// Thin entrypoint kept for backward compatibility with existing callers
// (listeners.service.ts, stats.processor.ts). The actual stat-type-aware
// calculation and gating now lives in StatsCalculationService, driven by
// the calculator registry in apps/aa/src/stats/stat-calculators.
@Injectable()
export class BeneficiaryStatService {
  constructor(private readonly statsCalculationService: StatsCalculationService) {}

  async saveAllStats() {
    return this.statsCalculationService.runAndSave();
  }
}
