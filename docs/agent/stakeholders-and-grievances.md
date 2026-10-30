# Stakeholders & grievances

Covers `apps/aa/src/stakeholders/` and `apps/aa/src/grievances/` — two record-keeping modules, independent of the money-movement spine but both sync to **core** (rahat-platform).

## Stakeholders (`stakeholders.service.ts`)

Not beneficiaries — stakeholders are the humans/orgs tracked around a project (partners, committee members, field staff — whoever the project needs a contact/role record for, grouped into stakeholder groups for activities). Shape:

- `add` / `update` / `remove` / `getAll` / `getOne` — standard CRUD, nothing unusual.
- `bulkAdd` + `validateBulkStakeholders` / `validateParsedStakeholders` — bulk import path (e.g. CSV), validated in two passes: structural/per-row validation, then cross-row checks (`fetchExistingByPhone`, `checkEmailConflicts`) to catch duplicates *within* the import batch and against existing records before anything is written — mirrors the beneficiary group CSV-import pattern, so a bad batch fails before any partial write.
- Groups: `addGroup`/`updateGroup`/`getAllGroups`/`getOneGroup`/`removeGroup`/`findOneGroup` — stakeholder groups are their own entity, not just a tag on `Stakeholder`; `removeGroup` has to walk `groupsWithStakeholder` to detach members first.
- `getActivitiesByStakeholderGroupUuid` — ties a group to `ActivityTypes`/`ActivitiesStatus` (project activities the group participates in).
- `stakeholdersCount()` is the method the event bus calls on every stakeholder change (see [otp-and-events.md](./otp-and-events.md)) — keep it cheap, it runs on every create/update/remove, not debounced.

## Grievances (`grievances.service.ts`)

A beneficiary/community complaint-handling flow, typed by `GrievanceType` (`TECHNICAL`/`NON_TECHNICAL`/`OTHER`) and `GrievanceStatus` (`NEW` → ... → `RESOLVED`/`CLOSED`), both Prisma enums (see [coding-patterns.md](./coding-patterns.md)'s "enum source of truth" rule).

**Every mutation syncs to core and compensates locally on failure** — this is the clearest example in the codebase of the `handleMicroserviceCall` pattern ([utils.md](./utils.md)):

```
create() → $transaction: write local Grievance row
  → handleMicroserviceCall(client.send({cmd: 'rahat.jobs.grievance.created'}, ...))
    onSuccess: return core's response
    onError: delete the just-created local row, then throw
```

`updateStatus` and `update` follow the same shape (transaction + core call + compensate-on-error) — if you touch this service, keep writes to core and local DB paired this way; don't let a local write survive a core rejection (or vice versa).

- `updateStatus` additionally computes `isResolvedNow`/`isClosedNow` transitions — status-change side effects (if any get added) belong gated on those booleans, not re-derived by comparing old/new status elsewhere.
- `getOverviewStats` — dashboard aggregate, groups by `GrievanceType` and `GrievanceStatus` via Prisma `groupBy`, not an in-memory reduce — keep new stat breakdowns on that pattern rather than pulling all rows.

## Why these are grouped in one doc

Both are secondary/record-keeping domains (no on-chain or payout involvement) that nonetheless talk to core directly — contrast with the money-movement docs, where AA ↔ core is implicit (it's rahat-platform driving AA, not AA calling out). Grievances is the one clear example of AA-initiates-call-to-core; worth knowing if you're tracing a `rahat.jobs.*` cmd.

_Last updated: 2026-10-15_
