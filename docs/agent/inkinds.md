# In-kind redemption

Covers `apps/aa/src/inkinds/`. App-side counterpart to the `InkindRedeem.sol` (`Inkind` contract) covered in [chain-implementation.md](./chain-implementation.md) — read that first for the on-chain `redeemInkind` mint behavior.

## What's different from a vendor cash redemption

A `VENDOR_REIMBURSEMENT` (see [beneficiary-and-vendors.md](./beneficiary-and-vendors.md)) moves existing token balance. An in-kind redemption represents a beneficiary receiving **physical goods** from a vendor (e.g. food, supplies) — the chain side mints fresh `RahatToken` to the vendor as reimbursement (`Inkind.redeemInkind` → `IRahatToken.mint`), and the app side tracks it through `inkinds.service.ts` plus a dedicated stock ledger, not through `BeneficiaryRedeem.transactionType`.

## Stock tracking

`InkindStockMovement` rows (`InkindStockMovementType.ADD` etc.) record inventory changes — stock added, then drawn down as redemptions happen. This is the in-kind equivalent of a beneficiary's `benTokens` balance in `AAProject.sol`, except it's inventory (items/value), not an on-chain balance, and lives purely in Postgres.

## OTP handling

Same OTP service (`OtpService`) as vendor redemption, but in-kind redemption can be explicitly OTP-exempt: `otpExemptionReason` is recorded per redemption and aggregated into stats (`otpReasonBreakdown`, `otpSkippedCount`/`otpNotSkippedCount`) — used to audit how often and why OTP verification was bypassed (e.g. beneficiary has no phone, vendor pre-verified, etc.) rather than silently skipping it.

## Bulk / offline redemption (`inkind-bulk-redeem.processor.ts`)

For redeeming many beneficiaries at once (e.g. a vendor batch-submitting a day's distributions):

- A batch is staged as a `TempOfflineInkindRedemption` row (`payloads`, `user`, `vendor`, status `PENDING`/`PROCESSING`/done) before being queued (`BQUEUE.INKIND_BULK_REDEEM`, job `JOBS.INKINDS.BULK_REDEEM_BATCH`) — same staging-table pattern as other offline flows in this repo, so a crash mid-batch doesn't lose the request.
- **Boot-time recovery**: `onModuleInit()` finds any `PENDING`/`PROCESSING` temp batches left over from a previous run and re-queues them with the *same* `jobId` (the batch's `uuid`) — Bull dedupes by `jobId`, so this is safe to run even if the job was actually still in-flight. Mirrors the `recoverStuckDisbursements()` pattern in `EVMCentralizedProcessor` (chain-implementation.md) — same "self-heal on restart" philosophy applied to a different queue.
- Each batch item eventually calls through to `IChainService.redeemInkind` / `redeemVendorInkindTokens`, which is what reaches `Inkind.redeemInkind` on-chain.

## Where this leads

- On-chain mint/ledger details: [chain-implementation.md](./chain-implementation.md) (`InkindRedeem.sol` section).
- Cash-equivalent vendor redemption (no minting, existing balance only): [beneficiary-and-vendors.md](./beneficiary-and-vendors.md).

_Last updated: 2026-10-15_
