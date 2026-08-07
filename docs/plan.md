# Async Queue Jobs — Durable Task Table & Recovery Plan

## Goal

Make Bull queue tasks resilient to **server crashes / restarts**. Bull's in-memory retry (`attempts`, `backoff`) is lost when the process dies, so a job that was mid-flight or failed permanently before restart is never retried. We add a **generic DB-backed task table** that persists every queued job, and a **generic recovery module** that replays leftover (failed) jobs when the app boots.

## Settled Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Table name | `tbl_async_queue_jobs` |
| Q2 | Status type | Free-form `String` (no enum — flexibility per job type) |
| Q3 | Retry | Bull handles retries (`attempts: 3`, exponential backoff). Jobs still `FAILED` after Bull gives up are replayed on module init of that job type |
| Q4 | Payload | Two JSON fields: `jobTypeData` + `metadata` |
| Q5 | Cleanup | Physical `DELETE` on completion (final state saved elsewhere) |
| Q6 | Concurrency | None needed — each job type has its own queue/processor; no shared worker claiming |
| Q7 | Job identity | Use existing `JOBS.*` constants (e.g. `aa.jobs.payout.assignToken`) as `jobName` |
| Q8 | Priority | None — FIFO by `createdAt` |
| Q9 | Replay order | FIFO (oldest failed first) |
| Q10 | Permanent failures | Left in table as `FAILED`; manually deleted after investigation |

## Schema

Add to `prisma/schema.prisma`:

```prisma
// ============== Start Async Queue Jobs SCHEMAS ================
model AsyncQueueJob {
  id          Int      @id @default(autoincrement())
  uuid        String   @unique @default(uuid())

  jobName     String              // JOBS constant, e.g. 'aa.jobs.payout.assignToken'
  status      String   @default("PENDING") // free-form: PENDING | PROCESSING | COMPLETED | FAILED | ...
  jobTypeData Json                // primary job payload
  metadata    Json?               // extra context (source, tags, parent job, etc.)

  error       String?
  retryCount  Int      @default(0)   // informational; Bull owns real retries
  maxRetries  Int      @default(3)   // mirrors Bull attempts, for reference

  startedAt   DateTime?
  completedAt DateTime?
  failedAt    DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([jobName, status])          // fast scan per job type for recovery
  @@index([createdAt])                // FIFO replay ordering
  @@map("tbl_async_queue_jobs")
}
// ============== End Async Queue Jobs SCHEMAS ================
```

Run migration: `npx prisma migrate dev --name async_queue_jobs`

## Job Lifecycle

```
enqueue() ──► row(status=PENDING) + queue.add(jobName, jobTypeData, {attempts:3})
                │
                ▼  processor picks up
           row(status=PROCESSING)
                │
        ┌───────┴────────┐
        ▼                ▼
     success           failure
        │                │
        ▼                ▼
   row → COMPLETED   row → FAILED  (Bull retries internally up to maxRetries)
        │                │
        ▼                │ exhausted → row stays FAILED
   DELETE row           ▼
                recovery module on module init:
                scan jobName + status=FAILED (FIFO by createdAt)
                → reset to PENDING → queue.add() again
```

## Files to Create / Modify

### 1. `prisma/schema.prisma` (modify)
Add `AsyncQueueJob` model above. Run migration.

### 2. `apps/aa/src/queue/async-queue.service.ts` (new)
Generic DB + Bull wrapper. Inject `Queue` references dynamically (per registered job).

Core API:
- `enqueue(input: { jobName, queue, jobTypeData, metadata?, attempts?, backoff? })` →
  1. `prisma.asyncQueueJob.create({ status: 'PENDING', ... })`
  2. `queue.add(jobName, jobTypeData, { attempts, removeOnComplete: true, backoff })`
  3. Store the table row `uuid` inside Bull job `data` (`_asyncJobId`) for correlation
- `markProcessing(uuid)` → status `PROCESSING`, `startedAt`
- `complete(uuid)` → status `COMPLETED`, `completedAt`, then **DELETE** row
- `fail(uuid, error)` → status `FAILED`, `error`, `failedAt`, increment `retryCount`
- `findFailed(jobName)` → FIFO list of `FAILED` rows (`orderBy createdAt asc`)
- `resetToPending(uuid)` → status `PENDING`

### 3. `apps/aa/src/queue/async-queue-recovery.service.ts` (new)
**Generic recovery module.** Keeps a registry of `{ jobName → queue }` (or an injected array of handlers). On `onModuleInit`:
1. For each registered jobName, `findFailed(jobName)`
2. For each failed row (oldest first): `resetToPending(uuid)` → `queue.add(...)` (reuse stored `jobTypeData`)
3. Log a summary: `Recovered N failed jobs for {jobName}`

Registering a new queue = just adding one entry to the registry. No per-queue recovery code.

### 4. `apps/aa/src/queue/queue.module.ts` (new)
Module providing `AsyncQueueService` + `AsyncQueueRecoveryService`. Must be imported by `AppModule` and by any module that enqueues.

### 5. `apps/aa/src/app/app.module.ts` (modify)
- Import `QueueModule`
- `onModuleInit()`: after existing `queueService.waitForConnection()`, call `asyncQueueRecoveryService.recoverAll()`

### 6. `apps/aa/src/processors/contract.processor.ts` (modify — first queue)
In `processCreateBeneficiariesInBatches`:
- Read `_asyncJobId` from `job.data`
- Wrap body: `markProcessing(uuid)` → try/catch → `complete(uuid)` / `fail(uuid, err)`
- (Recovery re-enqueues via the same queue/name, so no change needed to the `@Process` decorator)

## Which Queue To Wire First: `aa.jobs.beneficiary.create_beneficiaries_in_batches`

This is the beneficiary **group assign** flow (the batch size 500 case you started from). It is DB-heavy and crash-prone mid-batch, and the producer already sets `removeOnFail: false` — signalling failed jobs must stay visible. The async queue table replaces that in-Redis visibility with durable, replayable tracking.

**Why this one first:**
- The group is created **upfront** (`beneficiary.service.ts:1835`) *before* batches are enqueued — a server crash after group creation but mid-batch leaves an incomplete group with no automatic retry
- Each batch runs `beneficiary.upsert` + `beneficiaryToGroup.upsert` + `otp.upsert` inside a transaction → the most resource/connection-sensitive path in the app (that is why it was batched at 500 in the first place)
- Replay is **idempotent by design**: the processor calls `createBenfAndAddGroupToProject(dto, true)` with `skipGroupCreation=true`, so a replayed FAILED batch just upserts beneficiaries/membership — no duplicate group risk
- Single producer + single consumer → smallest, cleanest first wiring

### Producer (call site to replace)
| File | Line | Current call |
|------|------|--------------|
| `apps/aa/src/beneficiary/beneficiary.service.ts` | 1827–1883 (`createBeneficiariesInBatches`) | `this.contractQueue.add(JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES, jobData, { attempts: 3, removeOnComplete: true, removeOnFail: false, backoff: { type: 'exponential', delay: 1000 } })` |

**Entry point**: `beneficiary.controller.ts:126–132` — `createBenfAndAddGroupToProject` routes to the batched path when `beneficiaries.length > BENEFICIARY_BATCH_THRESHOLD`.

Becomes:
```ts
const { uuid } = await this.asyncQueueService.enqueue({
  jobName: JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
  queue: this.contractQueue,
  jobTypeData: jobData, // { beneficiaries, beneficiaryGroupId, ..., isLastBatch }
  metadata: {
    source: 'beneficiary.createBeneficiariesInBatches',
    totalBatches: batches.length,
  },
  attempts: 3,
  removeOnFail: false, // keep FAILED row so recovery can replay it
  backoff: { type: 'exponential', delay: 1000 },
});

jobIds.push(uuid); // preserve the { jobIds } return shape — table row uuid (was Bull job id)
```

### Consumer
- `apps/aa/src/processors/contract.processor.ts:895–943` — `processCreateBeneficiariesInBatches` (on `BQUEUE.CONTRACT`, `concurrency: 5`)

### Recovery registration
```ts
// in recovery registry
register({
  jobName: JOBS.BENEFICIARY.CREATE_BENEFICIARIES_IN_BATCHES,
  queue: contractQueue,
});
```

## Verification Checklist

- [ ] `npx prisma migrate dev` succeeds; `tbl_async_queue_jobs` exists
- [ ] `createBeneficiariesInBatches` no longer calls `contractQueue.add` directly
- [ ] Recovery module logs `Recovered N failed jobs for aa.jobs.beneficiary.create_beneficiaries_in_batches` on boot
- [ ] Completed rows are physically deleted; FAILED rows kept for replay
- [ ] Replayed batch does not duplicate the group (idempotent upsert confirmed)
- [ ] `npm run lint` and `npm test` pass
