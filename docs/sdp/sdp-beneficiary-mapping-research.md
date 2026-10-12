# Mapping AA Beneficiary UUID ↔ SDP Receiver Across Phone Number Changes

## Problem Statement

Rahat AA creates beneficiaries identified by a UUID and a phone number. Disbursements are sent
through the Stellar Disbursement Platform (SDP), a separate multi-tenant system with its own
internal `receiver` records. When AA updates a beneficiary's phone number, that change is **not**
currently propagated to the matching SDP receiver. This document investigates SDP's actual
receiver data model and matching behavior (from the SDP backend source and official API docs) and
lays out every viable approach to keeping AA UUID ↔ SDP receiver identity stable across phone
number changes.

All claims below are cited to a primary source: either the official Stellar developer docs, or the
`stellar/stellar-disbursement-platform-backend` Go source (fetched directly from GitHub at the time
of writing, `main`/`develop` branch). Local references are to this repo's `libs/stellar-sdp`
wrapper and `docs/stellar-disbursement.md`.

---

## 1. SDP Receiver API — what's actually in the schema and source

### 1.1 `POST /receivers` — create a receiver

Source: `internal/serve/dto` (`CreateReceiverRequest`) and validation in
`internal/serve/validators/receiver_validator.go` (`ValidateCreateReceiverRequest`),
`stellar/stellar-disbursement-platform-backend`, fetched via GitHub Contents API.

Request fields (confirmed in `receiver_validator.go` and the handler
`internal/serve/httphandler/receiver_handler.go::CreateReceiver`):

| Field | Required? | Notes |
|---|---|---|
| `email` | one of `email`/`phone_number` required | validated format |
| `phone_number` | one of `email`/`phone_number` required | validated format |
| `external_id` | **required, always** | `rv.Check(externalID != "", "external_id", "external_id is required")` — SDP has no concept of "optional" external_id on direct creation |
| `verifications[]` (`type`, `value`) | required unless `wallets[]` given | e.g. `DATE_OF_BIRTH`, `PIN`, `NATIONAL_ID_NUMBER`, `YEAR_MONTH` |
| `wallets[]` (`address`, `memo`) | required unless `verifications[]` given | max **one** wallet per receiver (`"only one wallet is allowed per receiver"`) |

Server-side insert (`internal/data/receivers.go::ReceiverModel.Insert`) writes
`phone_number, email, external_id, source_wallet_id` into the `receivers` table. The **only**
unique DB constraints enforced on write are `receiver_unique_email` and
`receiver_unique_phone_number` — there is **no unique constraint on `external_id`**. This is
directly visible in the Postgres-error-to-domain-error mapping in `Insert()`, which only
special-cases those two constraint names.

### 1.2 `GET /receivers` and `GET /receivers/{id}`

Source: `internal/serve/httphandler/receiver_handler.go` (`GetReceivers`, `GetReceiver`),
`internal/serve/validators/receiver_query_validator.go`, `internal/data/receivers.go`.

- Response shape (`GetReceiverResponse`): the `Receiver` object (`id`, `email`, `phone_number`,
  `external_id`, `source_wallet_id`, `created_at`, `updated_at`, plus payment-count stats) embedded
  with `wallets: ReceiverWallet[]` and, for `GET /receivers/{id}` only, `verifications:
  ReceiverVerification[]`.
- **Filterable fields on `GET /receivers` are hard-coded and limited**:
  `AllowedReceiverFilters = []FilterKey{FilterKeyStatus, FilterKeyCreatedAtAfter,
  FilterKeyCreatedAtBefore}` (`internal/data/receivers.go`). **There is no `phone_number` or
  `external_id` query filter on the public list endpoint.** `status` here means receiver-*wallet*
  status (`draft`/`ready`/`registered`/`flagged`), not a receiver property.
- Internally, the backend *does* have a `ReceiverModel.GetByContacts(...contacts)` function that
  looks a receiver up by phone or email (`WHERE r.phone_number = ANY($1) OR r.email = ANY($1)`),
  but this is a private data-layer method used only by the disbursement-instructions pipeline
  (§1.5) — it is **not exposed as a public HTTP filter**. There is also no `GetByExternalID`
  lookup function anywhere in the codebase.
- Practical consequence: **you cannot do `GET /receivers?external_id=<AA-uuid>` or
  `GET /receivers?phone_number=<phone>`.** The only reliable way to find a receiver by an
  externally known identifier is to list receivers and filter client-side (expensive — no `q`/
  search param exists either), or to have stored the SDP `receiver.id` yourself at creation time.

### 1.3 `PATCH /receivers/{id}` — update a receiver

Source: `internal/serve/validators/receiver_update_validator.go` (`UpdateReceiverRequest`,
`ValidateReceiver`) and `internal/serve/httphandler/update_receiver_handler.go`
(`UpdateReceiverHandler.UpdateReceiver`).

Confirmed request body fields: `date_of_birth`, `year_month`, `pin`, `national_id` (these four map
to receiver *verification* rows, upserted via `ReceiverVerification.UpsertVerificationValue`), and
`email`, `phone_number`, `external_id` (these three are receiver-row fields, applied via
`data.ReceiverUpdate` / `ReceiverModel.Update`).

**`phone_number` IS a documented, supported, updatable field on `PATCH /receivers/{id}`** — this
directly answers the research question: SDP supports updating a receiver's phone number
post-creation. The handler logic:

```go
contactChanged := (reqBody.Email != "" && reqBody.Email != currentReceiver.Email) ||
    (reqBody.PhoneNumber != "" && reqBody.PhoneNumber != currentReceiver.PhoneNumber)
if contactChanged {
    inFlight, _ := h.Models.Receiver.HasNonTerminalPayments(ctx, h.DBConnectionPool, receiverID)
    if inFlight {
        httperror.Conflict("Cannot edit contact details while the receiver has payments in flight.", nil, nil).Render(rw)
        return
    }
}
```

- **Failure mode**: `409 Conflict` if the receiver has any non-terminal (in-flight) payment when
  you try to change `phone_number` or `email`. There's no such restriction on changing
  `external_id` alone.
- **Failure mode**: `409 Conflict` with `ErrDuplicatePhoneNumber` / `ErrDuplicateEmail` if the new
  phone number is already used by a *different* receiver (DB unique constraint).
- Verification fields stay editable at all times (even mid-flight) — only *contact* field changes
  are blocked while payments are in flight.

### 1.4 `receiver_wallets` sub-resource

Source: `internal/data/receivers_wallet.go` (`ReceiverWallet` struct), and
`libs/stellar-sdp/src/services/receivers.service.ts` in this repo (already wraps the real
endpoints).

`ReceiverWallet` fields: `id`, `receiver` (embedded `Receiver`), `wallet` (embedded `Wallet`),
`stellar_address`, `stellar_memo`, `stellar_memo_type`, `status`
(`DRAFT`/`READY`/`REGISTERED`/`FLAGGED`), `status_history`, `otp_confirmed_at`,
`otp_confirmed_with`, `sep24_transaction_id`, `invited_at`, `last_message_sent_at`,
`invitation_sent_at`, plus payment stats.

Relationship: one receiver can have **multiple `receiver_wallets`** rows (one per SDP `wallet_id` /
distribution channel it has been disbursed through), but **only one Stellar address per wallet**
assignment; `POST /receivers` itself restricts a *new* receiver to a single wallet at creation
time. Updating a wallet's address/memo is `PATCH /receivers/{receiverId}/wallets/{walletId}`
(this repo's `ReceiversService.updateWallet`), and updating just status is
`PATCH /receivers/wallets/{walletId}/status` (`ReceiversService.updateWalletStatus`) — both match
the real backend route structure (`internal/serve/httphandler/receiver_wallets_handler.go`).

### 1.5 Disbursement instructions CSV format (`POST /disbursements/{id}/instructions`)

Source: `internal/data/disbursement_instructions.go` (`DisbursementInstruction` struct) and the
official templates in `stellar/stellar-disbursement-platform-frontend`
(`public/resources/disbursementTemplates/*.csv`).

Exact Go struct (this is what the uploaded CSV is unmarshaled into, column name = `csv` tag):

```go
type DisbursementInstruction struct {
    Phone             string `csv:"phone"`
    Email             string `csv:"email"`
    ID                string `csv:"id"`
    Amount            string `csv:"amount"`
    VerificationValue string `csv:"verification"`
    ExternalPaymentID string `csv:"paymentID"`
    WalletAddress     string `csv:"walletAddress"`
    WalletAddressMemo string `csv:"walletAddressMemo"`
}
```

Confirmed real template headers (fetched raw from GitHub):
- `PHONE_NUMBER.csv`: `phone,id,amount,paymentID`
- `PHONE_NUMBER_AND_WALLET_ADDRESS.csv`: `phone,walletAddress,walletAddressMemo,id,amount,paymentID`
  (matches exactly what `apps/aa/src/processors/sdp-stellar.processor.ts` in this repo already
  generates, confirming AA's current CSV generation code is aligned with the real template).

**Yes, there is an "external ID" column — it's the `id` column.** This is the field AA already
populates with `RECEIVER_<beneficiary-uuid>` (see `docs/stellar-disbursement.md` → "CSV
Generation"). But what that `id` column actually *does* on upload is the crux of the whole
problem (§1.6/§4).

### 1.6 How SDP actually matches/dedupes receivers on instructions upload — THE KEY FINDING

Source: `internal/data/disbursement_instructions.go::ProcessAll` →
`reconcileExistingReceiversWithInstructions` → `receiverModel.GetByContacts`.

```go
func (di DisbursementInstructionModel) reconcileExistingReceiversWithInstructions(...) {
    contacts := /* instruction.Contact() for every row — phone OR email, never both */
    existingReceivers, _ := di.receiverModel.GetByContacts(ctx, dbTx, contacts...)
    // existingReceiversByContactMap keyed by phone/email
    for _, instruction := range instructions {
        di.createReceiverFromInstructionIfNeeded(ctx, dbTx, instruction, existingReceiversByContactMap, sourceWalletID)
    }
    ...
}

func (r *ReceiverModel) GetByContacts(ctx context.Context, sqlExec db.SQLExecuter, contacts ...string) ([]*Receiver, error) {
    query := `SELECT ... FROM receivers r WHERE r.phone_number = ANY($1) OR r.email = ANY($1)`
    ...
}
```

and the creation branch, when no existing receiver is found for that phone/email:

```go
func (di DisbursementInstructionModel) createReceiverFromInstructionIfNeeded(...) error {
    _, exists := existingReceiversByContactMap[contact]
    if !exists {
        receiverInsert := ReceiverInsert{SourceWalletID: sourceWalletID}
        if instruction.Phone != "" { receiverInsert.PhoneNumber = &instruction.Phone }
        if instruction.Email != "" { receiverInsert.Email = &instruction.Email }
        if instruction.ID != "" { receiverInsert.ExternalID = &instruction.ID }
        di.receiverModel.Insert(ctx, dbTx, receiverInsert)
    }
    return nil
}
```

**This definitively confirms the hypothesis in the research brief**:

1. The CSV `id` column (the one AA populates with `RECEIVER_<uuid>`) is **only ever written** into
   `external_id` at receiver *creation* time (`createReceiverFromInstructionIfNeeded`). It is
   **never read back** to look up an existing receiver. The *only* lookup key used by
   `ProcessAll`/`GetByContacts` is **phone number or email**.
2. `external_id` has **no unique constraint** in the schema (§1.1). Nothing in SDP prevents two
   different `receivers` rows from carrying the identical `external_id`.
3. Combined: **if AA changes a beneficiary's phone number and later re-disburses to them (new CSV
   upload with the new phone), SDP will not find the existing receiver** (it was indexed under the
   old phone number) **and will silently INSERT A SECOND receiver row**, carrying the *same*
   `external_id` (AA UUID) as the original, orphaned receiver. The old receiver (with its wallet,
   verification history, and payment history) and the new receiver are now two disconnected SDP
   identities for the same AA beneficiary — exactly the failure mode the research brief was
   worried about, confirmed at the source-code level, not just inferred.

---

## 2. The `external_id` field — confirmed name and (non-)queryability

- Field name: **`external_id`** on the `Receiver` object, present on create (`POST /receivers`,
  required), update (`PATCH /receivers/{id}`, optional, "cannot be set to empty" per
  `receiver_update_validator.go`), and in every receiver read response.
- **Not filterable via `GET /receivers`** — `AllowedReceiverFilters` only permits `status`,
  `created_at_after`, `created_at_before` (§1.2). There is no public endpoint equivalent to
  `GET /receivers?external_id=...`.
- Not unique at the DB level (§1.1), so it cannot even be relied on as a de-facto natural key for
  a client-side "fetch-all-and-filter" workaround — a duplicate-receiver bug (as in §1.6) would
  produce two rows with the same `external_id` and no DB-level signal that anything is wrong.

## 3. Webhooks / events for receiver create or update

Source: `internal/events/events.go` (the full "frozen v1 event-type list"), confirmed by GitHub
code search across the repo for `ReceiverCreated`/`ReceiverUpdated` (zero results) and `webhook`
(only organization-level webhook secret storage + a generic `event_delivery_job` scheduler).

The entire v1 event catalogue is:

```go
const (
    DisbursementCreated   = "disbursement.created"
    DisbursementApproved  = "disbursement.approved"
    DisbursementRejected  = "disbursement.rejected"
    DisbursementSubmitted = "disbursement.submitted"
    DisbursementCompleted = "disbursement.completed"
    DisbursementFailed    = "disbursement.failed"
    DisbursementPaused    = "disbursement.paused"

    WalletCreated           = "wallet.created"
    WalletArchived          = "wallet.archived"
    WalletPromotedToDefault = "wallet.promoted_to_default"
    WalletMembershipGranted = "wallet.membership_granted"
    WalletMembershipRevoked = "wallet.membership_revoked"
)
```

**There is no `receiver.created` or `receiver.updated` event type, and the code comment explicitly
states "Adding a type is a spec change order."** SDP has a working transactional-outbox webhook
infrastructure (events table, `event_delivery_job` scheduler, per-organization webhook secret),
but it is scoped only to disbursement lifecycle and wallet lifecycle — **receivers are not
instrumented at all.** There is no way to be notified by SDP when a receiver is created, updated,
or (per §1.6) accidentally duplicated. Any cross-system sync has to be driven from the AA side
(poll, or — more robustly — never need to look it up because AA already holds the SDP receiver ID).

## 4. Summary of the identity-matching risk

> **Confirmed, not inferred: SDP's disbursement-instructions pipeline keys receiver identity
> exclusively off `phone_number`/`email` (§1.6), ignores the CSV `id` (`external_id`) column for
> matching, and enforces no uniqueness on `external_id`. A phone number change on the AA side,
> followed by a normal disbursement re-upload, will silently create a second, disconnected SDP
> receiver with a duplicate `external_id` rather than updating the existing one.**

---

## 5. All possible approaches to AA UUID ↔ SDP receiver mapping

| # | Approach | API calls required | When made | Failure modes | Effect of a phone number change |
|---|---|---|---|---|---|
| (a) | Store AA UUID in SDP's `external_id` at receiver creation, then **trust the instructions-upload flow** to reuse it | 1 CSV upload (`POST /disbursements/{id}/instructions`) per disbursement; no extra call | Every disbursement | `external_id` is write-only to the matching logic — SDP never reads it to find the receiver (§1.6). Silent duplicate receiver creation on contact change, with **no error, no conflict, no webhook** to detect it. | **Creates a second receiver** carrying the same `external_id`. Original receiver + wallet + verification + payment history orphaned. This is the status quo and the actual bug. |
| (b) | Store SDP's `receiver.id` **back into AA's beneficiary record** right after `POST /receivers` (or after the first disbursement response/`GET /disbursements/{id}` reveals the receiver) | 1 extra `GET`/response read per beneficiary, once, at first-contact time; then direct `PATCH /receivers/{sdpReceiverId}` on every phone change | At receiver creation, and again on every AA phone-number edit | Requires AA to create receivers explicitly via `POST /receivers` up front (or capture the ID the first time a disbursement happens to create one) rather than relying purely on CSV auto-creation; needs new storage field in AA DB; `PATCH` can 409 if a payment is in flight (§1.3) — needs a retry/backoff or defer-until-settled policy | **Correctly propagated**: `PATCH /receivers/{sdpReceiverId}` with the new `phone_number`, keyed by the SDP ID AA already has — no reliance on phone-based matching at all |
| (c) | Use `phone_number` as the join key (status quo) | 0 extra calls beyond normal CSV upload | n/a | This **is** the bug (§1.6). Also fragile even without phone changes: two AA beneficiaries who happen to share a phone (e.g. shared household phone) collide into one SDP receiver; SDP's unique-phone constraint will also reject disbursement creation outright if AA's generated CSV contains the same phone twice | Breaks completely — new receiver created, old one orphaned |
| (d) | Maintain AA's **own mapping table** (`aa_uuid`, `sdp_receiver_id`, `sdp_tenant`, `last_known_phone`) in the AA DB, populated/updated transactionally whenever AA talks to SDP | 1 call to populate at first creation (`POST /receivers` response, or first `GET /receivers?...` reconciliation sweep); 1 `PATCH /receivers/{id}` call on every phone change, driven by the mapping table (not by searching SDP) | At receiver creation and on every phone-number edit | Requires AA-side migration/table and an explicit place in the beneficiary-update flow to call out to SDP; if the `PATCH` call fails (network, 409 in-flight-payment) the mapping table and SDP state can drift — needs a reconciliation/outbox pattern (write mapping+intent in the same DB transaction as the AA phone update, then an async worker calls `PATCH` and clears the intent) | **Correctly propagated** and auditable — the mapping table is the single source of truth AA already controls, independent of what SDP's own (non-existent) external_id lookup supports |
| (e) | Explicit SDP receiver creation via `POST /receivers` (instead of implicit creation via CSV upload), done once per beneficiary before the first disbursement, capturing `receiver.id` immediately | 1 `POST /receivers` call per new AA beneficiary (at beneficiary-creation time, not at disbursement time) | At AA beneficiary creation | Doubles up with the CSV-driven auto-create path unless AA's disbursement processor is changed to rely on the existing receiver (matched by phone, same risk as (c), unless combined with (b)/(d)) rather than letting `ProcessAll` auto-create a second one if the phone has since changed | On its own, doesn't fix the phone-change problem — must be paired with (b)/(d) to actually update the stored receiver on change, not just create it earlier |
| (f) | Periodic reconciliation sweep: AA lists its own beneficiaries and, for each, lists SDP receivers under scope and attempts a best-effort match via contact info, flags mismatches for review | `GET /receivers` paginated (no `external_id`/`phone_number` filter available, §1.2 — must page through *all* receivers and compare in AA code) | Scheduled job | Expensive (no server-side filter), only a backstop/detection mechanism, does not itself fix anything, and cannot reliably identify duplicates since `external_id` collisions are allowed and undetected by SDP itself | Can *detect* the orphaned-duplicate problem after the fact, but can't prevent it and can't tell AA which of two same-external_id receivers is "current" without additional heuristics (e.g. most recent `updated_at`, which `receiver_wallets` has a `REGISTERED` wallet, etc.) |
| (g) | SDP webhooks for receiver change | — | — | **Does not exist.** Confirmed in §3: the only event types are `disbursement.*` and `wallet.*`. No `receiver.created`/`receiver.updated` event is emitted, so this is not a usable option today. | n/a |

---

## 6. Top 3 recommended approaches

Ranked by fewest API calls + robustness to phone number changes.

### #1 — (d) AA-owned mapping table + `PATCH` on change (most robust, recommended primary fix)

**Why it wins**: it is the only approach that is both correct (uses SDP's real, supported
`PATCH /receivers/{id}` update path, §1.3) and fully under AA's control — it does not depend on
SDP ever adding `external_id`/`phone_number` filters or webhooks that don't exist today (§1.2,
§3).

Concrete sequence:

1. **At beneficiary/receiver creation** (whichever happens first — explicit `POST /receivers` or
   the implicit create inside the first disbursement's `ProcessAll`):
   - If AA calls `POST /receivers` directly: capture `receiver.id` from the response body and
     `INSERT` a row into AA's own `beneficiary_sdp_map (aa_beneficiary_uuid, sdp_tenant,
     sdp_receiver_id, last_synced_phone)` in the same DB transaction as the beneficiary write.
   - If creation happens implicitly via the first CSV upload: after `POST
     /disbursements/{id}/instructions` succeeds, do **one** `GET /receivers?...` sweep scoped to
     that disbursement's wallet (there's no narrower filter, §1.2, so filter client-side by the
     phone numbers just sent) to capture the resulting `receiver.id` values, then backfill the
     mapping table. (Prefer explicit creation — see §6 Approach #2 — to avoid this extra call.)
2. **On every AA beneficiary phone-number update**, in the same transaction/outbox as the AA DB
   write: look up `sdp_receiver_id` from the mapping table by `aa_beneficiary_uuid`, then call:
   ```
   PATCH /receivers/{sdp_receiver_id}
   { "phone_number": "<new phone>" }
   ```
3. Handle the two documented failure modes from §1.3:
   - `409 Conflict` (`receiver has payments in flight`): retry later via a background job/outbox —
     do not drop the update.
   - `409 Conflict` (`ErrDuplicatePhoneNumber`): the new phone is already in use by a *different*
     SDP receiver — surface this as a data-integrity alert rather than silently failing.
4. Never re-upload a disbursement CSV as the mechanism for propagating a phone change — that path
   is the bug (§1.6), not a fix.

**Call count**: 1 call per phone-number change (`PATCH /receivers/{id}`), zero extra calls on
normal disbursement flow once the mapping table is populated.

### #2 — (b)+(e) Explicit receiver creation, capture `receiver.id` immediately (pairs with #1)

Do `POST /receivers` explicitly when an AA beneficiary first becomes eligible for an SDP
disbursement (rather than letting the CSV-upload pipeline auto-create it), so `receiver.id` is
captured in the very same request/response cycle as creation — no reconciliation sweep needed.

```
POST /receivers
{ "phone_number": "<aa phone>", "external_id": "<aa uuid>", "wallets": [{ "address": "<stellar addr>" }] }
→ 201 { "id": "<sdp receiver id>", ... }
```
Store `<sdp receiver id>` against the AA UUID immediately (feeds approach #1's mapping table).
Subsequent CSV disbursement uploads will match this receiver by phone (as long as the phone hasn't
changed since — which is exactly what approach #1 keeps in sync via `PATCH`).

**Call count**: 1 call (`POST /receivers`) at beneficiary onboarding, replacing the implicit
creation that currently happens inside the disbursement processor; zero extra calls thereafter.

### #3 — (f) Periodic reconciliation sweep as a safety net (detection only, not a fix)

Given SDP exposes no `external_id`/`phone_number` filter (§1.2) and no change-notification webhook
for receivers (§3), run a low-frequency (e.g. daily) job that pages through `GET /receivers`
(the only list endpoint available) for AA's tenant/wallet scope, groups by `external_id`, and
raises an alert whenever more than one `receiver.id` shares the same `external_id` — this is the
unambiguous signature of the bug in §1.6 having already occurred for a given beneficiary. Use this
to catch any gaps missed before approach #1 was fully rolled out, or any manual/out-of-band SDP
operations that bypass AA's own mapping table. Not a substitute for #1 — SDP gives no cheaper way
to detect this server-side, so this remains an O(all receivers) client-side scan, paginated.

**Call count**: O(receiver count / page size) `GET /receivers` calls per sweep; recommended as a
background job, not synchronous with any user-facing flow.

---

## Key Files / Sources Referenced

- `stellar/stellar-disbursement-platform-backend` (GitHub, fetched live):
  - `internal/serve/validators/receiver_validator.go` — `POST /receivers` validation, confirms
    `external_id` required
  - `internal/serve/validators/receiver_update_validator.go` — `PATCH /receivers/{id}` fields
  - `internal/serve/httphandler/receiver_handler.go` — `GET`/`POST /receivers` handlers
  - `internal/serve/httphandler/update_receiver_handler.go` — `PATCH /receivers/{id}` handler,
    in-flight-payment guard
  - `internal/data/receivers.go` — `Receiver` struct, `AllowedReceiverFilters`, `Insert`,
    `GetByContacts`, unique-constraint handling
  - `internal/data/receivers_wallet.go` — `ReceiverWallet` struct
  - `internal/data/disbursement_instructions.go` — `DisbursementInstruction` CSV struct,
    `ProcessAll`, `reconcileExistingReceiversWithInstructions`,
    `createReceiverFromInstructionIfNeeded` (the core matching-by-contact-only logic)
  - `internal/events/events.go` — frozen v1 webhook event-type list (no receiver events)
- `stellar/stellar-disbursement-platform-frontend`
  (`public/resources/disbursementTemplates/PHONE_NUMBER.csv`,
  `PHONE_NUMBER_AND_WALLET_ADDRESS.csv`) — official CSV templates, raw-fetched
- Official docs: `https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/api-reference/*`
  (receivers, update-receiver, disbursements, download-disbursement-instructions) — used for
  cross-checking endpoint existence/paths; several detail pages did not render full schema text
  through automated fetch, so field-level claims above are sourced from the backend Go code
  instead, which is authoritative (it's what actually runs).
- This repo: `docs/stellar-disbursement.md` (existing CSV generation flow, confirms AA already
  emits the `id` column as `RECEIVER_<uuid>` — exactly the field SDP ignores for matching),
  `libs/stellar-sdp/src/types/receiver.types.ts`,
  `libs/stellar-sdp/src/services/receivers.service.ts` (this repo's typed wrapper, confirmed to
  match the real backend routes)
