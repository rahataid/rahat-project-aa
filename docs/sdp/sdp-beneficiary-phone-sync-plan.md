# Plan: Keep SDP Receiver Phone in Sync with AA Beneficiary Phone

Status: **approved, ready to implement** (grilled and confirmed, 2026-10-12).
Supersedes nothing; builds on findings in `docs/sdp/sdp-beneficiary-mapping-research.md` — read
that first for the SDP-side evidence (source-cited) backing every claim below about how SDP
itself behaves.

## Problem (recap)

SDP's disbursement-instructions pipeline matches/dedupes receivers **exclusively by
`phone_number`/`email`** (`GetByContacts`, confirmed in SDP backend source). The CSV `id` column
AA already sends (`RECEIVER_<uuid>` → SDP's `external_id`) is write-only at creation — never read
back for lookup, never unique-constrained, never filterable via `GET /receivers`. So when AA
updates a beneficiary's phone and later re-disburses, SDP can't find the existing receiver and
silently creates a **second, disconnected receiver** with a duplicate `external_id`, orphaning the
first one's wallet/verification/payment history.

## Scope decisions (confirmed)

- **Only fixes it going forward**, for beneficiaries synced/disbursed from now on. **No backfill
  of already-existing orphaned/duplicate SDP receivers** — out of scope for this plan.
- **Only `syncBeneficiaryGroupData` is a real phone-update path.** `beneficiary.service.ts:552`'s
  single-record `update()` RPC exists in code but is not how AA actually changes a beneficiary's
  phone in practice — not hooked.
- **Mapping table lives in AA's own Prisma schema** (`prisma/schema.prisma`), same DB/transaction
  as the beneficiary write — not a separate service, per [[prefer-aa-db-over-core]].
- **No tenant column** on the mapping table. AA is single-tenant-per-deployment today (one
  `SDP_SETTINGS` row, one `tenantName`/`apiKey` pair — confirmed, no per-project SDP tenant table
  exists anywhere in this repo). Add a tenant column later via migration if that ever changes; no
  other table in this schema speculates ahead of that.
- **Backfill/reconciliation tooling**: a plain `ts-node` script under `tools/scripts/`, dry-run by
  default (prints a report), gated behind an `--apply` flag. Not built now unless/until actually
  needed — this plan doesn't require it since there's no backfill scope, but the script shape is
  reserved for later if the "duplicate `external_id`" detection sweep (§6) ever needs to act, not
  just report.
- **All of the below — mapping writes, phone-sync jobs, the pre-disbursement staleness check —
  apply only when `STELLAR_DISBURSEMENT_SETTINGS.STELLAR_DISBURSMENT_MODE === 'SDP'`** (default).
  When mode is `'DIRECT'` (local Stellar distribution wallet, no SDP involved at all —
  `stellar-chain.service.ts:221,274,1182`), none of this runs: there is no SDP receiver to create,
  map, or patch. Every new code path added by this plan starts with that mode check and no-ops on
  `'DIRECT'`.

## 1. New table: `BeneficiarySdpReceiver`

Follows the existing `BeneficiaryToGroup` convention (`prisma/schema.prisma:129-141`) — own
`id`/`uuid` pair, FK to `Beneficiary.uuid`, timestamps, `@@map`. No tenant column (see above).

```prisma
model BeneficiarySdpReceiver {
  id             Int         @id @default(autoincrement()) @db.Integer()
  uuid           String      @unique @default(uuid())
  beneficiary    Beneficiary @relation(fields: [beneficiaryId], references: [uuid])
  beneficiaryId  String      @unique @db.Uuid()
  sdpReceiverId  String
  lastSyncedPhone String?
  syncStatus     String      @default("SYNCED") // SYNCED | PENDING | FAILED
  lastSyncError  String?

  createdAt DateTime  @default(now())
  updatedAt DateTime? @updatedAt()

  @@map("tbl_beneficiary_sdp_receivers")
}
```

`beneficiaryId` is `@unique` (one SDP receiver per AA beneficiary, 1:1) — row existing at all is
the signal "this beneficiary has an SDP receiver"; absence means "never disbursed via SDP yet,
nothing to sync."

## 2. Capturing `sdpReceiverId` — hook in `sdp-stellar.processor.ts`

Current flow (`handleDisburse`, lines 60-182): build CSV → `sdpClient.disbursements.create()` →
upload instructions (~line 106-115) → `disbursements.updateStatus(STARTED)` (line 121) → queue
polling job.

**Add, right after the instructions upload succeeds** (before the status-update call at line 121
— receivers are already created synchronously inside SDP's CSV processing by this point, no need
to wait for payment/poll completion):

1. Mode check: if `STELLAR_DISBURSMENT_MODE !== 'SDP'`, skip this whole block (shouldn't be
   reachable anyway, since this processor is SDP-specific, but guard explicitly for safety).
2. Call `sdpClient.disbursements.listReceivers(disbursementId)` (already wrapped,
   `disbursements.service.ts:85-93`) — scoped to this one disbursement, not a tenant-wide sweep.
3. For each returned receiver, match by `external_id` (= `RECEIVER_<uuid>` AA just sent in the
   CSV) back to the AA beneficiary uuid.
4. `upsert` into `BeneficiarySdpReceiver` per matched beneficiary:
   `{ beneficiaryId, sdpReceiverId: receiver.id, lastSyncedPhone: receiver.phone_number,
   syncStatus: 'SYNCED' }`.

This is the **only** place rows get created. From here on, "does this beneficiary have a row" =
"has this beneficiary ever been disbursed via SDP."

## 3. Propagating phone changes — hook in `syncBeneficiaryGroupData`

`beneficiary.service.ts:2498-2564`, inside the existing `prisma.$transaction`, per beneficiary in
the batch:

1. Before the `upsert` (line 2510), capture `existingBeneficiary?.phone` (already fetched at line
   2500-2502).
2. After the upsert, if `existingBeneficiary` existed **and** `existingBeneficiary.phone !==
   benf.phone` (actual change, not a new beneficiary — new beneficiaries have nothing to sync yet,
   per §2) **and** mode is `'SDP'`:
   - Enqueue via `AsyncQueueService.enqueue()` (existing outbox, `async-queue.service.ts`) —
     `jobName: 'SDP_RECEIVER_PHONE_SYNC'`, queue `BQUEUE.STELLAR_SDP` (reuse the existing SDP
     queue, consistent with `STELLAR_SDP: `STELLAR_SDP_${PROJECT_ID}`` in `constants/index.ts:461`),
     `jobTypeData: { beneficiaryId: benf.uuid }` — **not** the new phone value itself; see §4 for
     why.
   - **Implemented as**: inside the `$transaction`, only `BeneficiarySdpReceiver.syncStatus` is set
     to `'PENDING'` (atomic with the phone write). The actual `AsyncQueueService.enqueue()` call
     happens right after the transaction commits, not inside it — avoids extending
     `AsyncQueueService` to accept a transaction client. The gap this leaves (process crashes
     between commit and enqueue → `PENDING` with no job queued) is covered by §5's pre-disbursement
     guard, which retries inline regardless of whether a queued job exists — so nothing is silently
     lost, just deferred to the next disbursement attempt.
   - Mark `BeneficiarySdpReceiver.syncStatus = 'PENDING'` for that beneficiary in the same
     transaction, so the pre-disbursement check (§5) sees it immediately, not just after the job
     eventually runs.
3. If no existing `BeneficiarySdpReceiver` row for this beneficiary at all — nothing to enqueue.
   The next disbursement's §2 flow will create the receiver fresh with whatever phone is current
   at that time; no staleness is possible for a beneficiary who's never touched SDP yet.

## 4. The sync job processor — re-fetch phone at execution time

New Bull processor on `BQUEUE.STELLAR_SDP` (or a dedicated small processor file alongside
`sdp-stellar.processor.ts`), handling `SDP_RECEIVER_PHONE_SYNC`:

```
1. await asyncQueueService.markProcessing(asyncJobId)
2. mode check: STELLAR_DISBURSMENT_MODE === 'SDP' — if not, complete() and no-op (mode may have
   flipped between enqueue and execution; don't call an SDP that's no longer in use)
3. currentPhone = (SELECT phone FROM Beneficiary WHERE uuid = beneficiaryId)   // NOT the payload
4. mapRow = (SELECT * FROM BeneficiarySdpReceiver WHERE beneficiaryId = beneficiaryId)
5. if currentPhone === mapRow.lastSyncedPhone: already in sync (a later edit already
   landed and got synced by a subsequent job run) → complete(), done
6. PATCH /receivers/{mapRow.sdpReceiverId} { phone_number: currentPhone }
   - 200: update mapRow.lastSyncedPhone = currentPhone, syncStatus = 'SYNCED'; complete()
   - 409 (payments in flight): fail(asyncJobId, '...') → AsyncQueueRecoveryService's sweep will
     retry it later (register this jobName/queue pair with the recovery service at module init,
     same pattern already used elsewhere); mapRow.syncStatus stays 'PENDING'
   - 409 (duplicate phone — another SDP receiver already owns that phone number): fail() +
     set mapRow.syncStatus = 'FAILED', mapRow.lastSyncError = '...'; this is a genuine
     data-integrity conflict (two AA beneficiaries ended up with the same phone), not a
     transient retry case — surface it (log at error level; alerting hook can be added later,
     out of scope here) rather than silently retrying forever
```

Step 3's re-fetch is why the job payload only carries `beneficiaryId`, not the phone value: if the
beneficiary's phone is edited again before this job runs, the job naturally picks up the *latest*
value with no dedup/debounce logic needed, and a stale queued job can never overwrite a newer
change.

## 5. Pre-disbursement staleness guard — hook in `sdp-stellar.processor.ts::handleDisburse`

Before building/uploading the CSV for a beneficiary (or the group), for each beneficiary with a
`BeneficiarySdpReceiver` row where `syncStatus !== 'SYNCED'`:

1. Attempt the sync inline, synchronously, one retry: re-run step 4's logic (re-fetch current
   phone, `PATCH /receivers/{id}`) directly in the disbursement flow, right there.
2. If it now succeeds: proceed with that beneficiary's disbursement normally.
3. If it still fails: **exclude only that beneficiary** from this disbursement batch (log + skip,
   don't abort the whole group's disbursement over one stuck record) and leave its queued
   `AsyncQueueJob` to retry independently via the recovery sweep.

This prevents the actual harm case: disbursing to a beneficiary under a phone number SDP doesn't
know is stale, without letting one bad record stall an entire batch.

## 6. Detection-only safety net (optional, not built now)

No SDP webhook exists for receiver changes (confirmed — only `disbursement.*`/`wallet.*` events),
and no `external_id`/`phone_number` filter exists on `GET /receivers`, so there is no cheap
server-side way to detect drift. If ever needed: a scheduled job paging `GET /receivers`, grouping
by `external_id`, alerting on any `external_id` appearing on more than one `receiver.id` — the
unambiguous signature of this exact bug having occurred (e.g. via a path this plan doesn't cover,
or manual SDP-side edits). Per scope decisions above, not built now — reserved as a `tools/scripts`
dry-run report if it's ever needed.

## Edge cases — confirmed handling

| Edge case | Handling |
|---|---|
| Beneficiary never disbursed via SDP, phone changes | No `BeneficiarySdpReceiver` row → nothing enqueued. Next disbursement creates the receiver fresh with current phone (§2). No staleness possible. |
| Phone edited twice before first sync job runs | Job re-fetches current phone at execution time (§4, step 3), not the payload snapshot — self-corrects, no dedup needed. |
| `PATCH` 409 — payment in flight | `AsyncQueueService.fail()`, left `PENDING` in the map row; retried later by `AsyncQueueRecoveryService.recoverAll()` sweep (existing infra, just register this `jobName`). |
| `PATCH` 409 — duplicate phone (two AA beneficiaries converge on one phone) | Marked `FAILED` + `lastSyncError` set — not retried blindly; genuine data conflict, logged for manual resolution. |
| Disbursement runs while a phone sync is still `PENDING` | §5 retries inline once, excludes only that beneficiary from the batch on failure — doesn't block the rest of the group. |
| `STELLAR_DISBURSMENT_MODE === 'DIRECT'` | Every new code path (§2, §3, §4, §5) starts with a mode check and no-ops — no SDP receiver involved in DIRECT mode at all. |
| Mode flips from `SDP` to `DIRECT` between enqueue and job execution | Job processor re-checks mode at execution time (§4, step 2) and no-ops rather than calling a client that's no longer the active disbursement path. |
| Pre-existing orphaned/duplicate receivers from before this fix | Explicitly out of scope — not backfilled. |
| AA single-record `update()` RPC (`beneficiary.service.ts:552`) | Not hooked — confirmed not a real phone-update path in practice. |

## Implementation checklist

- [x] Prisma migration: add `BeneficiarySdpReceiver` model (§1) —
      `prisma/migrations/20261012063000_add_beneficiary_sdp_receiver/`
- [x] `sdp-stellar.processor.ts`: capture `sdpReceiverId` after instructions upload (§2) —
      `captureSdpReceiverIds()`
- [x] `beneficiary.service.ts::syncBeneficiaryGroupData`: detect phone diff, mark `PENDING`
      (inside `$transaction`), enqueue sync job after commit (§3)
- [x] New processor for `SDP_RECEIVER_PHONE_SYNC` job (`handleReceiverPhoneSync`), registered with
      `AsyncQueueRecoveryService` in `queue.module.ts` (§4)
- [x] `handleDisburse`: pre-disbursement staleness check + inline retry + per-beneficiary skip (§5) —
      `reconcileStalePhoneSyncs()`
- [x] Mode guard (`STELLAR_DISBURSMENT_MODE === 'SDP'`) added at every new entry point above
- [ ] Verify the exact response shape of `GET /disbursements/{id}/receivers` against a real SDP
      sandbox — `captureSdpReceiverIds()` handles it defensively (nested `receiver` object or flat),
      since the shape wasn't pinned to field level in the research doc; confirm which shape SDP
      actually returns and simplify once known.
- [ ] `npx prisma migrate deploy` (or `migrate dev`) against a reachable DB — the migration file was
      hand-written (no DB available in this environment to run `prisma migrate dev` directly) and
      needs to actually run once a dev/staging DB is reachable.
- [ ] Manual/integration test: phone edit on a beneficiary with an existing SDP receiver → confirm
      `PATCH /receivers/{id}` fires and SDP reflects the new phone.
