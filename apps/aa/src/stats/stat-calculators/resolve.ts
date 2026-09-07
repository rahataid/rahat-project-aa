import { StatCalculator } from './types';
import { COMMON_CALCULATORS } from './common';
import { FLOOD_CALCULATORS } from './flood';
import { HEAT_WAVE_CALCULATORS } from './heat-wave';

// A project has exactly one active stat type at a time — resolution is a
// single lookup into this registry, never a merge/union of several types.
//
// To support a new dashboard (e.g. a project/org/hazard-scoped variant like
// "MCN_PROJECT_HEAT"): create its folder next to flood/ and heat-wave/,
// spread COMMON_CALCULATORS (or a subset) plus its own calculators in that
// folder's index.ts, then register the resulting array below under its own
// key. Nothing else in this file changes.
const STAT_TYPE_REGISTRY: Record<string, StatCalculator[]> = {
  FLOOD: FLOOD_CALCULATORS,
  HEAT_WAVE: HEAT_WAVE_CALCULATORS,
};

export class UnknownStatTypeError extends Error {
  constructor(statType: string) {
    super(`No stat calculators registered for stat type "${statType}"`);
  }
}

export function resolveCalculators(statType: string): StatCalculator[] {
  const calculators = STAT_TYPE_REGISTRY[statType?.toUpperCase?.()];
  if (!calculators) {
    throw new UnknownStatTypeError(statType);
  }
  return calculators;
}
