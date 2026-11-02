# Stats (`apps/aa/src/stats/`)

Dashboard aggregate numbers (demographics, forecast-readiness indicators, etc.) for a project — separate from vendor/payout stats computed inline in `stats.service.ts: getVendorTransactions`-adjacent queries (payouts-and-offramp.md), this module is the project-wide dashboard.

## One active stat type per project, resolved by registry

`stat-calculators/resolve.ts` holds `STAT_TYPE_REGISTRY: Record<string, StatCalculator[]>`, currently `FLOOD` and `HEAT_WAVE`. `StatsCalculationService.getStatType()` reads the project's `PROJECTINFO` setting (`PROJECT_TYPE`) to pick which one applies — **a project has exactly one stat type active at a time**, never a merge of several. `resolveCalculators()` throws `UnknownStatTypeError` for anything not registered — don't silently fall back to an empty list.

Each calculator folder (`flood/`, `heat-wave/`) exports an array of small, single-purpose calculator files (`gender.calculator.ts`, `age-groups.calculator.ts`, `house-type.calculator.ts`, etc.) plus an `index.ts` that assembles them, often spreading `common/`'s `COMMON_CALCULATORS` (shared across hazard types) and adding hazard-specific ones on top.

**Adding a new project/hazard variant** (per the inline comment in `resolve.ts`): create a sibling folder next to `flood/`/`heat-wave/`, compose `COMMON_CALCULATORS` (or a subset) plus new calculators in its own `index.ts`, register the result under a new key in `STAT_TYPE_REGISTRY`. Nothing else in the file changes — this is the extension point, same spirit as `chain-service.registry.ts`'s pattern for a new chain.

## Supporting aggregation helpers

Calculators lean on generic helpers in `utils/index.ts` (`mapAgeGroupCounts`, `countBySSAType`, `generateLocationStats`, `extractLatLng`, etc. — see [utils.md](./utils.md)) rather than each calculator rolling its own grouping/counting logic. A new calculator that needs "count rows by X" should check there first.

`StatsCalculationService.runAndSave(statType?)` is the entry point — resolves the type (explicit or from settings), runs every calculator in that type's array, persists via `StatsService`.

_Last updated: 2026-10-15_
