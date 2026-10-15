# Payouts & offramp

Covers `apps/aa/src/payouts/`, `apps/aa/src/group-cash-transfer/`, and the offramp processors. Continuation of [beneficiary-and-vendors.md](./beneficiary-and-vendors.md) — read that first for reservation + `transactionType`/`PayoutType` basics.

## Payout creation

`payouts.service.ts: create()` makes a `Payouts` row, usually inside the same transaction as `beneficiary.service.ts: reserveTokenToGroup` (`isPayoutIntegrated: true`). Key fields:

- `type: PayoutType` — `FSP` (cash out to a financial service provider — bank/mobile money) or `VENDOR` (reimburse a vendor for CVA/in-kind redemption).
- `mode: PayoutMode` — `ONLINE` or `OFFLINE`.
- `payoutProcessorId` — identifies which downstream processor handles it. `'manual-bank-transfer'` is special-cased: processed automatically at creation, and explicitly blocked from `triggerPayout` (can't be double-triggered).
- `disbursementStatus` starts `NOT_DISBURSED` — flips once the chain layer confirms disbursement (see `chain-implementation.md`); `triggerPayout` refuses to run until this is confirmed.

## Triggering a payout (`triggerPayout`)

OTP-gated (`verifyOtp(user.email, otp)` — this OTP is on the triggering *user*, separate from the beneficiary-facing vendor OTP in the beneficiary/vendors doc). Guards before proceeding:

1. Not already triggered (`isPayoutTriggered`).
2. Tokens actually disbursed on-chain (`beneficiaryGroupToken.isDisbursed`) — can't pay out funds that haven't landed yet.
3. Not a `manual-bank-transfer` payout.

For `FSP` payouts, stashes `payoutTriggeredAt`/`payoutTriggeredBy` on `extras` (used later for the `group_gap` metric — trigger time to last-paid-beneficiary time). Then builds one `FSPPayoutDetails` per beneficiary (amount, wallet, bank details, phone, the offramp wallet address, `offrampType` from `payoutExtras.paymentProviderType`) and pushes them through `stellarTransferService.addBulkToTokenTransferQueue` — i.e. first move tokens **on-chain** to the offramp wallet, batched (see `stellar-transfer-batch.processor.ts` in chain-implementation.md), *then* the fiat leg below picks it up.

## FSP / offramp fiat leg

```
triggerPayout → token transfer to offramp wallet (on-chain, batched)
  → offramp.processor.ts (OfframpProcessor, BQUEUE.OFFRAMP)
    → OfframpService (offramp.service.ts)
      → external FSP API (CIPS) over HTTP — TODO in code: "replace API calls with SDK"
        → BeneficiaryRedeem.transactionType = 'FIAT_TRANSFER', status progresses
          PENDING → FIAT_TRANSACTION_INITIATED → FIAT_TRANSACTION_COMPLETED/FAILED
```

- `OfframpProcessor` concurrency is configurable (`getConcurrency()`, default `DEFAULT_OFFRAMP_CONCURRENCY = 10`) — reads chain type to decide, since EVM vs Stellar offramp throughput differs.
- Progress is cached in Redis (`PAYOUT_CACHE_KEY_PREFIX`, 5s TTL) — `getPayoutDetails`/progress polling reads from cache instead of re-querying Postgres on every poll.
- `CipsResponseData`/`CipsApiResponse` (`payouts/dto/types.ts`, `offramp/dto/types.ts`) are the FSP integration's (CIPS) response shapes — this is the "financial service provider" the `FSP` payout type is named after.
- Failures are retried per-row, not per-batch: `processOneFailedFiatPayout({ beneficiaryRedeemUuid })` re-drives a single stuck `FIAT_TRANSFER` redeem; `processOneFailedTokenTransferPayout` does the same for a stuck `TOKEN_TRANSFER`.

## VENDOR payout leg

For `PayoutType.VENDOR`, there's no offramp/FSP step — `vendor-cva-payout.processor.ts` (`BQUEUE.VENDOR_CVA`) and `vendors.service.ts` write `VENDOR_REIMBURSEMENT` redeems directly once the vendor's claim (online OTP or offline batch — see beneficiary-and-vendors.md) is accepted. Manual payouts (field-officer-entered CSV rows, `manual-payout.processor.ts`) also land as `FIAT_TRANSFER`/`VENDOR_REIMBURSEMENT` depending on what the row represents, and are matched/enriched (`EnrichedManualPayoutRow`) before being queued either to `BQUEUE.BATCH_TRANSFER` (token leg, `processTokenTransfers`) or to offramp verification (`addToOfframpVerificationQueue`).

## Group cash transfer (`group-cash-transfer/`)

A variant of the FSP path for **bulk/treasury-level** cash transfers rather than per-beneficiary payouts: `gct-treasury.service.ts` manages the treasury side, `gct-offramp.client.ts` is its own thin offramp HTTP client (separate from `OfframpService` above — don't conflate the two; this one isn't driven through `payouts.service.ts`'s per-beneficiary `triggerPayout`). `transactionType` here uses the separate `TransactionType` enum (`TREASURY` / `VENDOR` / `OFFRAMP`) on `tbl_transfer`, not `PayoutTransactionType` on `BeneficiaryRedeem` — a different table, same idea.

## PDF logs

`payout-logs-pdf.builder.ts` renders the downloadable payout log (`downloadPayoutLogs`) — joins `Payouts` → `BeneficiaryRedeem` → `Beneficiary`/`Vendor`, used for audit/reporting, not part of the money-movement path itself.

_Last updated: 2026-10-15_
