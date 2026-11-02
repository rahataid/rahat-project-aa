# Beneficiary token lifecycle & vendors

Covers `apps/aa/src/beneficiary/` and `apps/aa/src/vendors/`: how tokens get reserved for a group, the shapes a redemption can take, and how vendors redeem. Continues into [payouts-and-offramp.md](./payouts-and-offramp.md) for the FSP/offramp side, and [inkinds.md](./inkinds.md) for in-kind redemption.

## 1. Reservation (`beneficiary.service.ts: reserveTokenToGroup`)

Before any disbursement, funds are **reserved** against a `BeneficiaryGroup`:

- Guards: a group can only have one active (`status: 'NOT_DISBURSED'`) reservation at a time (`TOKEN_ALREADY_RESERVED` otherwise); `groupPurpose` must be `BANK_TRANSFER` / `MOBILE_MONEY` / `GENERAL` (and `GENERAL` is only valid for `VENDOR` payouts or no-payout-integrated reservations).
- On Stellar, reservation is refused outright if any beneficiary in the group isn't yet sponsored (see `chain-implementation.md`'s sponsor section) — avoids reserving funds no one can receive yet.
- `skipOldPayoutForRemaining` (if set) closes out the group's prior open payout **before** the new reservation is created — otherwise the old payout's `GROUP_TOKEN_RESERVED_FOR_DISBURSE` listener could start disbursing against stale state and the money-return logic would claw back the new reservation's tokens.
- The reservation (`beneficiaryGroupTokens` row) and, if `isPayoutIntegrated`, the matching `Payouts` row are created in one Prisma `$transaction` — they succeed or fail together.
- Emits `EVENTS.GROUP_TOKEN_RESERVED_FOR_DISBURSE` → this is what the chain layer (`chain.service.ts`/`evm-chain.service.ts`/`stellar-chain.service.ts`) listens for to actually assign/disburse on-chain.

## 2. Redemption types

A redemption is a `BeneficiaryRedeem` row. Its `transactionType` (`PayoutTransactionType` enum) tells you which path moved the money:

| `transactionType` | Meaning | Who pays out |
|---|---|---|
| `TOKEN_TRANSFER` | On-chain token sent straight to a beneficiary/offramp wallet | `stellar-transfer*.processor.ts` / EVM batch transfer |
| `FIAT_TRANSFER` | Beneficiary cashed out to fiat (bank/mobile money) through an FSP | `offramp.processor.ts` via `OfframpService` (see payouts doc) |
| `VENDOR_REIMBURSEMENT` | A vendor redeemed value on a beneficiary's behalf (CVA voucher redemption) | `vendors.service.ts` / `vendor-cva-payout.processor.ts` |

`status` (`PayoutTransactionStatus`) tracks progress per type: `PENDING → TOKEN_TRANSACTION_INITIATED/FIAT_TRANSACTION_INITIATED → …COMPLETED` or `…FAILED`, finally `COMPLETED`/`FAILED`/`CANCELLED`. Failed rows are retried individually — `payouts.service.ts: processOneFailedFiatPayout` / `processOneFailedTokenTransferPayout` — not by re-running the whole group.

Which `transactionType` a payout produces follows its `PayoutType` (`FSP` or `VENDOR`), set at payout creation — see [payouts-and-offramp.md](./payouts-and-offramp.md).

## 3. Vendor redemption (`vendors/vendors.service.ts`)

Two modes, same destination (`VENDOR_REIMBURSEMENT`), different gating:

- **Online** — real-time, OTP-gated. Beneficiary provides an OTP (checked against `otp` table: not found / expired / already-verified all rejected) before the vendor's claim is accepted; processed by `VendorOfflinePayoutProcessor.processVendorOnlinePayout` (`BQUEUE.VENDOR_CVA`, despite the class name — handles the online job too) with concurrency 5.
- **Offline** — for connectivity-poor field conditions. Vendor batches redemptions locally; the app queues them (`offlineRedeemQueue`, chunked) and verifies **after the fact**, no live OTP round-trip — matches `IChainService`'s `OfflineTransferItem`/`OfflineTransferResult` shape (see `chain-service.interface.ts`). `otpExemptionReason` on the resulting redeem row records why OTP was skipped (used for the OTP-skip stats breakdown).

Every vendor transaction list (`getVendorTransactions`) is keyed off `transactionType: 'VENDOR_REIMBURSEMENT'` + `vendorUid` — vendors never see `FIAT_TRANSFER`/`TOKEN_TRANSFER` rows, those belong to the beneficiary/offramp side.

## Where this leads

- Group reserved + payout integrated with `PayoutType.VENDOR` → vendor redemption flow above.
- Group reserved + payout integrated with `PayoutType.FSP` → `payouts.service.ts: triggerPayout` → offramp → external FSP (fiat). See [payouts-and-offramp.md](./payouts-and-offramp.md).
- Redemption is in-kind goods, not token/fiat → [inkinds.md](./inkinds.md).

_Last updated: 2026-10-15_
