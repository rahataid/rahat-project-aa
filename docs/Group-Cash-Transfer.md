# Group Cash Transfer (GCT)

This document explains the Group Cash Transfer module: how a group's fund is assigned a budget-backed treasury, how disbursement moves tokens on-chain and converts them to a bank transfer, and how failures are retried without double-spending.

Module: `apps/aa/src/group-cash-transfer/`

## Overview

A "group cash transfer" pays out a single bank account (a community/group's account) . The flow is:

1. Create a group (`GroupCashTransferDetail`) with its name, phone, and bank details.
2. Assign a fund amount to the group (`GroupCashTransferRecord`).
3. Disburse the fund in two explicit steps:
   - **Initiate** (`disburse`): checks the available budget and transfers the token on-chain to the offramp wallet.
   - **Confirm** (`confirmDisburse`): calls the external offramp provider to convert the already-transferred token into a bank transfer.

Disbursement is capped by a treasury budget: a dedicated chain wallet (`GCT_TREASURY`) holds the token/asset that funds GCT payouts, and its live on-chain balance **is** the budget. A disbursement is blocked if the treasury doesn't have enough balance to cover it.

This module is intentionally independent of `apps/aa/src/payouts/**` — it does not import `OfframpService`, `StellarTransferProcessor`, or any payout processor. It only reuses genuinely generic infrastructure: the `@rahataid/stellar` `StellarClient`, `apps/aa/src/utils/bank.ts` (`getBankId`), and the existing `Setting`/`AppService` pattern.

## Data model

`prisma/schema.prisma`:

```prisma
model GroupCashTransferDetail {
  uuid        String  @unique @default(uuid())
  name        String
  phone       String?
  bankDetails Json?   // { bankName, accountNumber, accountName, ... }
  extras      Json?
  groupCashTransferRecords GroupCashTransferRecord[]
}

model GroupCashTransferRecord {
  uuid                String  @unique @default(uuid())
  groupCashTransferId String
  title               String
  amount              Float?  @default(0)

  status            String    @default("NOT_STARTED")
  payoutProcessorId String?   // which payment provider to use for the offramp call
  txHash            String?   // set once the on-chain transfer to the offramp wallet succeeds
  disbursementInfo  Json?     // last error / offramp response, for diagnostics and retry
  disbursedAt       DateTime?
}
```

`status` moves through: `NOT_STARTED` → `TOKEN_TRANSFER_FAILED` (retriable) | `TOKEN_TRANSFERRED` (awaiting confirm) → `OFFRAMP_FAILED` (retriable) | `COMPLETED`.

`txHash` is the durable handoff between initiate and confirm — once it's set, the token has moved and will never be re-transferred, no matter how many times `disburse`/`confirmDisburse` are called afterward.

## Settings

### `GCT_TREASURY`

Seeded via `prisma/seed-gct-treasury.ts` (same pattern as `STELLAR_SPONSOR_SETTINGS`):

```ts
value: {
  GCT_TOKEN: string,       // stellar: "<asset_code>:<asset_issuer>"; evm: "0x<tokenContractAddress>"
  GCT_SECRET_KEY: string,  // treasury signer (Stellar secret / EVM private key)
  GCT_PUBLIC_KEY: string,  // treasury address — balance is checked and transfers are signed from here
}
```

### `CHAIN_SETTINGS` and `OFFRAMP_SETTINGS`

These are the same settings already used elsewhere in the app (`type: 'stellar' | 'evm'`, `rpcUrl`, `chainId` for the former; `url`, `appid`, `accesstoken` for the latter — reused for fetching the offramp wallet address and calling the instant-offramp API).

## Treasury service — `GctTreasuryService`

File: `apps/aa/src/group-cash-transfer/gct-treasury.service.ts`

Responsibilities:

- **`onModuleInit()`**: reads `CHAIN_SETTINGS.type` and `GCT_TREASURY.GCT_PUBLIC_KEY`, and classifies the key's chain by its address shape (56 chars starting with `G` → Stellar; `0x` + 40 hex chars → EVM). **If the key's chain doesn't match the active `CHAIN_SETTINGS.type`, it logs a warning and marks the treasury as misconfigured.** From that point, `getBalance`, `transfer`, and `getTreasuryInfo` all throw immediately — disbursement is blocked until the mismatch is fixed.
- **`getBalance()`**: reads the live on-chain balance of `GCT_TOKEN` at `GCT_PUBLIC_KEY` (Horizon for Stellar, an ERC-20 `balanceOf`/`decimals` call for EVM). This is the "budget".
- **`transfer(toAddress, amount)`**: signs and submits a transfer of `amount` from the treasury to `toAddress`, returning the transaction hash. Stellar uses a plain non-sponsored `sendPayment` (the treasury pays its own fee); EVM uses a signed ERC-20 `transfer`.
- **`getTreasuryInfo()`**: returns `{ publicKey, balance, chainType, asset }` — never returns `GCT_SECRET_KEY`.

## Offramp client — `GctOfframpClient`

File: `apps/aa/src/group-cash-transfer/gct-offramp.client.ts`

A small, independent HTTP client (its own `HttpService`) for the same external offramp provider the `payouts` module talks to — but implemented separately so GCT has no code dependency on the payout module:

- `getOfframpWalletAddress()` — `GET {OFFRAMP_SETTINGS.url}/app/{appId}` → the wallet the token should be sent to before the fiat leg.
- `instantOfframp(payload)` — `POST {url}/offramp-request/instant` → converts the on-chain transfer into a bank transfer.

## Disbursement flow

### Step 1 — `disburse(recordUuid, payoutProcessorId)` (initiate)

```
cmd: JOBS.GROUP_CASH_TRANSFER.DISBURSE
payload: { uuid: string; payoutProcessorId?: string }
```

1. Load the record. Throw if not found, or if `status === 'COMPLETED'`.
2. **If `txHash` is already set** (a previous initiate succeeded): no-op — return `{ success: true, message: 'Transfer already initiated, ready to confirm', txHash }`. This makes it safe to call `disburse` again at any time, including after the process was left mid-flight.
3. Otherwise, `payoutProcessorId` is required — it identifies which payment provider the confirm step should use for the offramp call, and it's supplied by the caller (frontend), not derived from anything server-side.
4. Check the budget: `treasuryService.getBalance()` must be ≥ `record.amount`, or the call throws `Insufficient budget` and nothing is changed (retriable once the treasury is funded).
5. Fetch the offramp wallet address and transfer the token from `GCT_TREASURY` to it via `treasuryService.transfer(...)`.
   - On failure: record is marked `TOKEN_TRANSFER_FAILED` with the error in `disbursementInfo`, and the error is rethrown. Nothing was moved, so calling `disburse` again retries the transfer.
   - On success: record is updated with `{ txHash, status: 'TOKEN_TRANSFERRED', payoutProcessorId }`.

### Step 2 — `confirmDisburse(recordUuid)` (confirm)

```
cmd: JOBS.GROUP_CASH_TRANSFER.CONFIRM_DISBURSE
payload: { uuid: string }
```

1. Load the record (with its group's `bankDetails`). Throw if not found, or if `status === 'COMPLETED'`.
2. Throw if `txHash` is not set yet (`Transfer not initiated — call disburse first`).
3. Throw if `payoutProcessorId` is not set (`call disburse with a payoutProcessorId first`) — confirmation is gated on the processor having been chosen at initiate time.
4. Build the offramp payload from the group's `bankDetails` (`getBankId` maps `bankName` to a CIPS bank code, plus `accountNumber`/`accountName`), the record's `txHash`, and `payoutProcessorId` (sent as `paymentProviderId`).
5. Call `offrampClient.instantOfframp(payload)`.
   - On failure: record is marked `OFFRAMP_FAILED` with the error in `disbursementInfo`, and the error is rethrown. **The token is already on the offramp wallet, so retrying is just calling `confirmDisburse` again** — it is never re-transferred.
   - On success: record is marked `{ status: 'COMPLETED', disbursedAt, disbursementInfo: { result } }`.

This whole flow runs synchronously inside the request (no BullMQ queue) — a GCT disbursement is one admin-triggered call for one group's bank account, not a bulk beneficiary fan-out like `payouts`, so the queue/backoff machinery that module uses isn't needed here.

### Sequence

```
Admin                 GCT Service              GctTreasuryService        GctOfframpClient        Chain / Offramp API
  |--- disburse(uuid, processorId) ---------------->|
  |                        |--- getBalance() ------------->|
  |                        |<---- balance ------------------|
  |                        |--- getOfframpWalletAddress() -------------------->|
  |                        |<---- wallet ---------------------------------------|
  |                        |--- transfer(wallet, amount) -->|
  |                        |                                 |--- sign & submit tx --> Chain
  |                        |<---- txHash --------------------|
  |                        |  save { txHash, TOKEN_TRANSFERRED, payoutProcessorId }
  |<---- ready to confirm --|
  |
  |--- confirmDisburse(uuid) ------------------------>|
  |                        |--- instantOfframp(payload) ------------------------>|
  |                        |                                                      |--- POST /offramp-request/instant --> Offramp provider
  |                        |<---- result ------------------------------------------|
  |                        |  save { COMPLETED, disbursedAt, disbursementInfo }
  |<---- disbursement completed ------------------------|
```

## Budget / reporting endpoints

### `GET_TREASURY_INFO`

```
cmd: JOBS.GROUP_CASH_TRANSFER.GET_TREASURY_INFO
```

Returns `{ publicKey, balance, chainType, asset }` from `GctTreasuryService.getTreasuryInfo()`. Throws if the treasury is misconfigured (chain/key mismatch) or its settings are missing.

### `GET_GCT_DATA` (extended)

```
cmd: JOBS.GROUP_CASH_TRANSFER.GET_GCT_DATA
```

In addition to the existing group/record counts and status breakdown, this now also returns:

- `treasuryBalance` — the treasury's live balance (the budget), or `null` if it couldn't be fetched.
- `totalAllocatedAmount` — sum of `amount` across all non-deleted records (i.e. total funds assigned to groups via `assignFund`).
- `remainingBudget` — `treasuryBalance - totalAllocatedAmount`, or `null` if the balance is unavailable.

If the treasury balance can't be read (e.g. misconfigured or RPC unavailable), `getGCTData` logs a warning and still returns the rest of the report with `treasuryBalance`/`remainingBudget` as `null`, rather than failing the whole call.

## Error handling & retry semantics

| Situation | Record state | How to recover |
|---|---|---|
| Insufficient treasury balance at initiate | unchanged (`NOT_STARTED`/previous status) | Fund the treasury, call `disburse` again |
| On-chain transfer fails | `TOKEN_TRANSFER_FAILED`, error in `disbursementInfo` | Call `disburse` again — no `txHash` yet, so the transfer is retried from scratch |
| Transfer succeeds, `confirmDisburse` not yet called | `TOKEN_TRANSFERRED` | Call `confirmDisburse` whenever ready — no time limit, safe to defer to a later session |
| Offramp call fails | `OFFRAMP_FAILED`, error in `disbursementInfo` | Call `confirmDisburse` again — `txHash` is already set, so the token is **not** re-transferred, only the offramp call is retried |
| Already completed | `COMPLETED` | Both `disburse` and `confirmDisburse` reject further calls |

## Chain/treasury misconfiguration

If `GCT_TREASURY.GCT_PUBLIC_KEY` is a Stellar-shaped address (56 chars, starts with `G`) while `CHAIN_SETTINGS.type` is `evm` (or vice versa), `GctTreasuryService` logs a warning on startup and blocks `getBalance`, `transfer`, and `getTreasuryInfo` with an explicit error until the setting is corrected. This prevents disbursing against the wrong chain's wallet.
