import { PrismaService } from '@rumsan/prisma';
import { StatDto } from '../dto/stat.dto';

export interface BeneficiaryExtrasRecord {
  extras: any;
}

// Shared, precomputed data every calculator gets access to so the overall
// run stays at a handful of DB queries no matter how many calculators are
// registered for a stat type.
export interface StatCalcContext {
  prisma: PrismaService;
  allExtras: BeneficiaryExtrasRecord[];
}

export interface StatCalculator {
  // Identifies the calculator for logging/debugging. Doesn't have to match
  // the stat name(s) it produces one-to-one (e.g. ward-location produces
  // one row per ward: WARD3, WARD5, ...).
  key: string;
  run(ctx: StatCalcContext): Promise<StatDto | StatDto[]>;
}
