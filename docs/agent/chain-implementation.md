# Chain implementation — deep dive

Expands [AGENT.md](../../AGENT.md)'s chain section. Covers the full EVM flow (contract → dispatcher → processor → service) and the full Stellar flow (direct Horizon disbursement, SDP disbursement, sponsor/trustline).

For any Stellar-specific query, also load the `stellar-dev` skill (`.claude/skills/stellar-dev/` / `.agent/skills/stellar-dev/`) — it has Stellar/Soroban domain knowledge this doc doesn't duplicate.

## EVM flow

### 1. Contracts (`apps/contracts/src/contracts/`)

- **`AAProject.sol`** — the project contract. Holds `defaultToken` (the AA ERC20), tracks `benTokens[address]` (amount assigned per beneficiary) and `benCashTokens[address]`. Core beneficiary ops:
  - `assignTokenToBeneficiary(address, amount)` — admin-only (`restricted`, via `AccessManaged`), credits a beneficiary's internal ledger from the project's token balance. Does **not** move tokens yet — it's an internal allocation.
  - `transferTokenToVendor(ben, vendor, amount)` — actually moves `defaultToken` from the project to a vendor, debiting the beneficiary's `benTokens`. This is the disbursement/redemption step.
  - `transferTokenToVendorForCashToken(...)` — same, but also pulls a matching `CashToken` back from the vendor to the beneficiary (`transferFrom`) — the voucher-for-cash swap used by cash-tracker/inkind-style flows.
  - Uses `ERC2771Context` (meta-transactions — beneficiary/vendor never needs gas) and `AccessManaged` (role-gated admin calls via `RahatAccessManager.sol`).
  - Holds a reference to `TriggerManager` but the actual gate (`TriggerManager.hasTriggered()`) is currently commented out in `assignClaims` — triggering is tracked on-chain but not yet enforced at the contract level for this path.

- **`TriggerManager.sol`** — anticipatory-action trigger ledger. Admins register trigger sources (`updateTriggerSource`, e.g. a forecast feed) by `sourceId`. When a source fires, `trigger(sourceId)` is called and recorded. `hasTriggered()` returns true once `triggers.length >= requiredTriggers` — i.e. action is confirmed once enough independent sources have triggered (quorum). Mirrors the Stellar side's `TriggerManager` equivalent (Soroban contract in `soroban/trigger/`).

- **`RahatToken.sol`** — the AA program's ERC20 (voucher/value token). Owner-minted (`AbstractOwner`), burnable, meta-tx enabled. Carries `price`/`currency`/`description` so one token = one voucher denomination.

- **`CashToken.sol`** — plain mintable/burnable ERC20 used as the "cash" leg in the vendor cash-for-token swap (`Ownable`, simpler than `RahatToken`).

- **`RahatTreasury.sol`** — budget bookkeeping per `(year, country)` treasury: `createTreasury`, `increaseBudget`, `redeemToken`. Independent of the project contract — used for higher-level fund tracking, not per-beneficiary balances.

- **`InkindRedeem.sol`** (contract name `Inkind`) — in-kind redemption ledger. `redeemInkind(inkind[], vendor, beneficiary, inkindsValue)` is `restricted` (admin/relayer only): marks each `bytes16` in-kind token id as redeemed by that beneficiary (`redeemedInkind` mapping — also acts as a double-redeem guard, since each id is only ever written once), records which vendor served that beneficiary (`beneficiaryVendors`), then **mints** `inkindsValue` of `RahatToken` directly to the vendor via `IRahatToken.mint`. Unlike `AAProject`'s vendor transfer (which moves existing balance), this creates new token supply as the vendor's reimbursement for goods already given in-kind. App-side counterpart: `apps/aa/src/inkinds/` + `IChainService.redeemInkind`/`redeemVendorInkindTokens`.

- **`RahatDonor.sol`**, **`RahatAccessManager.sol`** — donor registry and access-control roles respectively (not expanded here — same pattern: one concern per contract, admin-gated via `AccessManaged`/`Ownable`).

Compiled ABIs are copied into `apps/aa/src/contracts/abis/` (e.g. `AAProject.json`, `TriggerManager.json`) — that's what the NestJS side `require()`s; it never touches Solidity source at runtime.

### 2. App-side flow: dispatcher → processor → service

```
chain.service.ts (IChainService entrypoint)
  → evm-chain.service.ts        (EvmChainService — builds job payload)
    → evmTxQueue / evmQueryQueue (BullMQ, defined in chain-queue.service.ts)
      → dispatcher/evm.dispatcher.ts   (EVMTxDispatcher / EVMQueryDispatcher — @Processor)
        → processors/evm-centralized.processor.ts (EVMCentralizedProcessor — does the actual ethers.js work)
          → ethers.Signer / Provider → AAProject / TriggerManager contracts (via ABIs)
```

- **Two queues, two concurrency models**: `BQUEUE.EVM_TX` (write ops — `assignTokens`, `redeemInkind`, `fundAccount`, `transferTokens`, `redeemVendorTokenForCash`) runs at **concurrency 1** — serialized, because every tx shares one deployer signer/nonce. `BQUEUE.EVM_QUERY` (read ops — `disbursementStatusUpdate`, `checkBalance`) runs at **concurrency 5** — no signer, safe to parallelize.
- `EVMTxDispatcher` / `EVMQueryDispatcher` are thin routers: they switch on `job.data.type` (from `JOBS.EVM.*` / `JOBS.CONTRACT.*`) and hand off to the matching `EVMCentralizedProcessor` method. All the ethers.js logic (provider/signer setup from `CHAIN_SETTINGS`/`deployerPrivateKey`, contract calls, event emission) lives in `EVMCentralizedProcessor`.
- `EVMCentralizedProcessor.onModuleInit()` checks `CHAIN_SETTINGS.type === 'evm'` before initializing the provider — on a Stellar-configured deployment this processor just stays dormant.
- **Recovery on boot**: `recoverStuckDisbursements()` scans `beneficiaryGroupTokens` for `STARTED && !isDisbursed` groups and re-queues whatever step was lost (a `SUBMITTED` batch re-queues its status check; a `PENDING` batch with no `txHash` re-queues the assign job). This is what makes a crashed/restarted service self-heal mid-disbursement.
- **Batching for large groups**: `processors/batch-token-transfer.processor.ts` (`BQUEUE.BATCH_TRANSFER`, concurrency 1) splits a disbursement's transfer list into chunks of `BATCH_SIZE = 10` and processes them sequentially, continuing to the next batch even if one fails (partial failure doesn't abort the whole run — failures surface per-batch in the result).

## Stellar flow

Three distinct money-movement paths live in `stellar-chain.service.ts` (`StellarChainService`, implements `IChainService`), selected by `STELLAR_DISBURSEMENT_SETTINGS.STELLAR_DISBURSMENT_MODE` (`'DIRECT'` or default `'SDP'`):

### A. SDP disbursement (default mode)

Stellar Disbursement Platform (SDP) is an external service (Stellar's own disbursement product) this app talks to via `@rahataid/stellar-sdp`'s `SdpClient` (`libs/stellar-sdp/`) — wraps SDP's receivers/disbursements/payments/statistics HTTP API, auth'd per-tenant.

- `disburse()` → for each group, queues `JOBS.STELLAR_SDP.DISBURSE` onto `BQUEUE.STELLAR_SDP`.
- `processors/sdp-stellar.processor.ts` (`SdpStellarProcessor`) handles that job: creates/syncs SDP receivers for the group's beneficiaries, calls `SdpClient.disbursements`, then polls disbursement status with **exponential backoff** (`15s → 30s → 60s → 2m → 3m` cap, timing out after 24h) via `JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE`.
- **Destination account**: for returns/queries in SDP mode, the destination is `getSdpDistributionAccount()` — fetched from the SDP API, not a secret this app holds. Because this app has no private key for that account, the **sponsor wallet pays the transaction fee** on SDP-mode operations (beneficiaries never pay).
- `preDisburse()` supports "disburse-on-create": a group can be sent to SDP the moment it's created, before the explicit `disburse()` call; `disburse()` detects that (`existingDisbursementId` on the reserved token's `info`) and just re-queues a status check instead of re-disbursing.

### B. Direct disbursement (`STELLAR_DISBURSMENT_MODE = 'DIRECT'`)

No SDP involved — this app holds `STELLAR_DISTRUBUTION_WALLET_SECRET` directly and talks straight to Horizon via `StellarClient` (`libs/stellar/`, `@rahataid/stellar`).

- `queueDirectGroupDisbursement()` → `BQUEUE.STELLAR_DISBURSE` / batched transfer via `stellar-transfer/stellar-transfer-batch.processor.ts` (`BQUEUE.STELLAR_TRANSFER_BATCH`, concurrency 1), which pays beneficiaries straight from the distribution wallet and creates a `BeneficiaryRedeem` log per transfer before submitting.
- **Destination/fee payer**: the distribution wallet (derived from its own secret via `Keypair.fromSecret`) is both the source of funds and the fee payer — no sponsor involved on this path.
- `MAX_TRANSFERS_PER_BATCH` (from `@rahataid/stellar`) caps how many payment operations go in one Stellar transaction.

### C. Sponsor + trustline flow (both modes depend on this)

Stellar requires every account to hold a minimum XLM reserve and every asset to have an explicit trustline before it can receive that asset — beneficiaries can't be expected to have either. `stellar-sponsor/stellar-sponsor.service.ts` (`StellarSponsorService`) handles this ahead of any disbursement:

- Only active when `CHAIN_SETTINGS.type === 'stellar'` (no-ops otherwise).
- Listens for `EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT` → for each new beneficiary in the group, sponsors (creates/funds) their Stellar account and establishes the asset trustline, batched at `STELLAR_SPONSOR_BATCH_SIZE = 12` via `BQUEUE.STELLAR_SPONSOR`.
- `assertSponsorFundsForGroup()` is a **pre-flight check**: before persisting a group assignment, it verifies the sponsor wallet has enough free balance (on-chain balance minus Stellar's minimum-balance reserve, minus funds already locked by pending/queued sponsorships) to cover sponsoring the whole incoming group — rejects the assignment up front rather than failing mid-batch.
- `StellarChainService.onModuleInit()` calls `ensureSponsorTrustline()` at startup — makes sure the **sponsor wallet itself** trusts the configured asset (no-op if already trusted). Separate from sponsoring *beneficiary* trustlines.
- `returnTokensToDistributionWallet()` (used when reversing/returning unredeemed group tokens) shows the mode split directly: DIRECT mode returns to the distribution wallet with the distribution wallet paying its own fee; SDP mode returns to the SDP-reported distribution account with the **sponsor** paying the fee, since this app holds no secret for the SDP account.

### Stellar queues at a glance

| Queue | Purpose |
|---|---|
| `BQUEUE.STELLAR_SPONSOR` | account creation + trustline sponsorship for new beneficiaries |
| `BQUEUE.STELLAR_SDP` | SDP-mode disbursement + status polling (`sdp-stellar.processor.ts`) |
| `BQUEUE.STELLAR_DISBURSE` | direct-mode disbursement kickoff |
| `BQUEUE.STELLAR_TRANSFER_BATCH` / `BQUEUE.STELLAR_TRANSFER` | batched Horizon payments (direct mode, offramp transfers) |
| `BQUEUE.STELLAR_SEND_ASSET` | vendor/OTP-gated asset send |
| `BQUEUE.STELLAR_INKIND_REDEEM` | in-kind redemption on Stellar (uses a cached `StellarClient` — see `inkindClient` in `stellar-chain.service.ts`, avoids rebuilding a Horizon connection per call) |

## Chain-agnostic boundary

Both flows are reached only through `IChainService` (`chain/interfaces/chain-service.interface.ts`) and resolved via `chain/registries/chain-service.registry.ts`. Nothing outside `chain/`, `dispatcher/`, `processors/`, `stellar-*`/`group-cash-transfer` should import `EvmChainService` or `StellarChainService` directly — see AGENT.md's coding-patterns section.

_Last updated: 2026-10-15_
