# OTP & the event bus

Covers `apps/aa/src/otp/` and `apps/aa/src/listeners/`. Both are load-bearing plumbing referenced throughout [beneficiary-and-vendors.md](./beneficiary-and-vendors.md), [payouts-and-offramp.md](./payouts-and-offramp.md), [inkinds.md](./inkinds.md) and [chain-implementation.md](./chain-implementation.md) but never explained at source until now.

## OTP (`otp/otp.service.ts`)

- **Dev vs prod split**: `isProduction` (`NODE_ENV === 'production'`) gates actual SMS delivery. Outside production the OTP is generated/returned and logged (`[DEV] OTP for ...`), never sent — every non-prod environment is effectively OTP-bypassable by reading logs. Don't "fix" this by sending real SMS in dev; it's deliberate.
- **Hashing** (`utils/hash.ts`): `getOtpHash` is sha256. `verifyOtpHash` checks sha256 first, falls back to `bcrypt.compare` only if the stored hash looks like a bcrypt hash (`$2a$/$2b$/$2y$` prefix) — legacy rows hashed before the sha256 switch still verify. New code should never write a bcrypt hash; sha256 is current.
- **`sendSms` vs `sendStoredOtp`**: `sendSms` always mints or reuses a passed-in OTP and sends it fresh. `sendStoredOtp` is for *re-sending* — it reuses whatever's already on the `otp` row so the existing hash stays valid, and only writes a new OTP+hash back if the row had none. Don't call `sendSms` for a resend — it'll silently diverge from the stored hash in edge cases.
- **`sendBulkOtp`**: sequential (not parallel) per-phone sends, one failure recorded per entry, loop continues — matches the "partial failure is fine, report per-item" convention used by `batch-token-transfer.processor.ts` (see chain-implementation.md).
- OTP exemption (`otpExemptionReason` on redemption rows, used by vendors/inkinds) is tracked at the *caller's* side, not in this service — `otp.service.ts` only ever issues/verifies, it doesn't decide when OTP can be skipped.

## Event bus (`listeners/listeners.service.ts`)

The `EventEmitter2`-based nervous system — almost every cross-module side effect in this repo is an `@OnEvent` handler here, not a direct call. When adding a new side effect to an existing flow, check here first for whether it already has a listener before wiring a direct dependency.

| Event | Handler does |
|---|---|
| `BENEFICIARY_CREATED` / `_REMOVED` / `_UPDATED` / `TOKEN_RESERVED` | Debounced (2s) `BeneficiaryStatService.saveAllStats()` — rapid-fire changes collapse into one stats recompute |
| `STAKEHOLDER_CREATED` / `_REMOVED` / `_UPDATED` / `TOKEN_RESERVED` | `StakeholdersService.stakeholdersCount()` (not debounced) |
| `GROUP_TOKEN_RESERVED_FOR_DISBURSE` | Checks `DISBURSED_ON_CREATE` setting; if on, immediately calls `chainService.preDisburse()` — this is the "disburse-on-create" path referenced in chain-implementation.md's SDP section |
| `BENEFICIARY_REDEEM_COMPLETED` | `payoutsService.checkAndCompletePayout()` — this is what flips a payout to complete once its last redemption lands |
| `AUTOMATED_TRIGGERED` | Removes the matching repeatable job from `BQUEUE.SCHEDULE` once an automated (forecast) trigger has fired — one-shot, not recurring after trigger |
| `CVA_EVENTS.DISBURSEMENT.INITIATED` | Delegates to `CvaDisbursementService.create()` (`libs/cva`) |
| `NOTIFICATION.CREATE` | Queues `BQUEUE.NOTIFICATION` job (3 attempts, exponential backoff) |
| `CVA_EVENTS.VENDOR.CREATED` | Queues XLM sponsor-funding for the new vendor wallet — **queued, not called directly**, specifically to serialize against `StellarSponsorProcessor`'s other batches (sponsor/revoke) and avoid a Stellar sequence-number race on the shared sponsor account; see the inline comment in the source for the full reasoning |

**Pattern to follow**: when a new flow needs a side effect in another module, emit an event (`EVENTS.*` or the relevant `*_EVENTS` constant) and add a handler here, rather than injecting that module's service directly into the flow's own service. Keeps the money-movement services (beneficiary/payouts/chain) from accumulating unrelated dependencies.

_Last updated: 2026-10-15_
