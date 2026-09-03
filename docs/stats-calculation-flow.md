# Stats Calculation Flow

## Overview

Stats are computed per **project type** (`statType` — e.g. `FLOOD`, `HEAT_WAVE`). Each type has a registry of **calculators** that produce `StatDto` rows persisted in `tbl_stats`. The system supports three trigger modes (startup, beneficiary change, manual backfill).

---

## Architecture

```
apps/aa/src/stats/
  stats.controller.ts              # Redis message handlers
  stats.service.ts                 # DB CRUD, token stats, triggers stats
  stats-calculation.service.ts     # Orchestrator: resolve → run → save
  dto/stat.dto.ts                  # { name, data, group }
  stat-calculators/
    index.ts                       # Re-exports
    types.ts                       # StatCalculator interface, StatCalcContext
    resolve.ts                     # STAT_TYPE_REGISTRY + resolveCalculators()
    helpers.ts                     # countExtrasFieldValuesNormalized()
    common/                        # Shared calculators (run for ALL stat types)
      index.ts                     # COMMON_CALCULATORS array
      *.calculator.ts
    flood/                         # Flood-specific calculators
      index.ts
      *.calculator.ts
    heat-wave/                     # Heat-wave-specific calculators
      index.ts
      *.calculator.ts
```

---

## Core Types

```typescript
interface BeneficiaryExtrasRecord {
  extras: any;   // JSON blob from Beneficiary.extras
}

interface StatCalcContext {
  prisma: PrismaService;
  allExtras: BeneficiaryExtrasRecord[];  // Pre-loaded in one query
}

interface StatCalculator {
  key: string;
  run(ctx: StatCalcContext): Promise<StatDto | StatDto[]>;
}

class StatDto {
  name: string;   // e.g. "beneficiary_gender"
  data: object;   // e.g. [{ id: "MALE", count: 1052 }]
  group?: string; // e.g. "beneficiary"
}
```

---

## Calculator Patterns

### Pattern A: Known-value fields (yes/no)

Use `countExtrasFieldValuesNormalized(records, fieldName, ['yes', 'no'])` from `helpers.ts`.

### Pattern B: DB aggregations

Use `prisma.beneficiary.groupBy()` or `.count()` directly — useful when data lives outside `extras`.

### Pattern C: Distinct value counting

For extras fields where values are not predetermined, use a reduce over `allExtras`:

```typescript
function countField(records: BeneficiaryExtrasRecord[]) {
  return records.reduce((acc, cur) => {
    const v = cur.extras?.field_name;
    if (v) acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
```

---

## Registration Mechanism

**`resolve.ts`** holds the registry:

```typescript
const STAT_TYPE_REGISTRY: Record<string, StatCalculator[]> = {
  FLOOD: FLOOD_CALCULATORS,
  HEAT_WAVE: HEAT_WAVE_CALCULATORS,
};
```

Each type folder's `index.ts` exports its calculator array by spreading `COMMON_CALCULATORS` plus type-specific ones:

```typescript
export const HEAT_WAVE_CALCULATORS: StatCalculator[] = [
  ...COMMON_CALCULATORS,
  activitiesStatusCalculator,
  coolingAppliancesAvailableCalculator,
  // ...
];
```

---

## runAndSave() Flow

```
StatsCalculationService.runAndSave(statType?)
  │
  ├─ 1. Resolve type from param or PROJECTINFO.PROJECT_TYPE
  │
  ├─ 2. resolveCalculators(type) → StatCalculator[]
  │
  ├─ 3. prisma.beneficiary.findMany({ select: { extras: true } })
  │      → allExtras (single DB query, shared by all calculators)
  │
  ├─ 4. Promise.allSettled(calculators.map(c => c.run({ prisma, allExtras })))
  │      → Fault isolation: one failure doesn't affect others
  │
  ├─ 5. Flatten results → StatDto[]
  │
  └─ 6. StatsService.saveMany(stats)
         ├─ Uppercase names
         ├─ DELETE tbl_stats WHERE group = <first stat's group>
         └─ INSERT tbl_stats (name, data, group)
```

---

## Trigger Chain

| Trigger | File | When |
|---|---|---|
| App startup | `stats.processor.ts` | `onApplicationBootstrap()` |
| Beneficiary change | `listeners.service.ts` | `BENEFICIARY_CREATED/UPDATED/REMOVED`, `TOKEN_RESERVED` (debounced 2s) |
| Manual backfill | `stats.controller.ts` | Redis message `aa.jobs.stats.backFill` |

All converge through: `BeneficiaryStatService.saveAllStats()` → `runAndSave()`.

---

## findAll vs backFill

| Aspect | findAll | backFill |
|---|---|---|
| Source | Reads `tbl_stats` + microservice triggers + local token calc | Recalculates everything fresh |
| Beneficiary stats | From DB (already saved) | `runAndSave()` → overwrites in DB |
| Triggers stats | From triggers microservice | From triggers microservice |
| Token stats | `getTokenStats()` local calc | `getTokenStats()` local calc |
| Use case | Dashboard data fetch | Manual sync/recalculation |

---

## How to Add a New Calculator

1. **Create** `apps/aa/src/stats/stat-calculators/<type>/<name>.calculator.ts`
2. **Implement** `StatCalculator` interface with `key` and `run()`
3. **Register** in the type folder's `index.ts` (import, export, add to array)

---

## How to Add a New Project Type

1. **Create** `apps/aa/src/stats/stat-calculators/<new-type>/`
2. **Create** its `index.ts` with calculator array (imports `COMMON_CALCULATORS`)
3. **Register** in `resolve.ts` — add entry to `STAT_TYPE_REGISTRY`
4. **Export** from `stat-calculators/index.ts`
5. **Set** `PROJECT_TYPE = '<NEW_TYPE>'` in `PROJECTINFO` settings

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Single `allExtras` query | Avoids N+1 query per calculator |
| `Promise.allSettled` | Fault isolation per calculator |
| Group-based delete+reinsert | Atomic replacement of a stat group |
| `COMMON_CALCULATORS` spread | No duplication across types |
| Stat type from `PROJECTINFO` setting | Runtime-configurable, no env var needed |
