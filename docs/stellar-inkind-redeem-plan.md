# Real Stellar transfer for `redeemInkind` + inkind-asset trustlines

## Context

`StellarChainService.redeemInkind` (`apps/aa/src/chain/chain-services/stellar-chain.service.ts:817-843`) is currently a stub: it never touches the chain, just stamps a `generateRandomTxHash('stellar')` onto the matching `BeneficiaryInkindRedemption` rows via `InkindsService.updateRedeemInkindTxHash`. The goal is to make this a real transfer of a distinct "inkind" Stellar asset (separate from the RAHAT token used for cash disbursement), including trustline setup, following the same sponsored-account patterns already used for RAHAT (`StellarSponsorService`/`StellarSponsorProcessor`, `libs/stellar`).

Decisions (confirmed during planning discussion):
- **One shared inkind asset** for all inkind items (not per-item assets) — new settings key `INKIND_ASSET_SETTINGS`, same shape as `STELLAR_SPONSOR_SETTINGS` (`StellarClientConfig`).
- **Second `StellarClient` instance** scoped to the inkind asset — no changes to `libs/stellar` at all. `createSponsoredAccountsBatch` already handles "trustline-only" for existing accounts, so it can be reused as-is against a client whose `asset` is the inkind asset.
- **Trustline timing**: eager batch trustline creation when inkind is assigned to a group (`PRE_DEFINED` path, `InkindsService.assignGroupInkind`); lazy (checked/created inline) at redemption time for walk-in beneficiaries who never went through group assignment.
- **Transfer amount**: 1 unit of the inkind asset per redeemed quantity — sourced from the `quantity`/`quantityRedeemed` values already computed at each redemption call site (no new price/value field needed).

## Current state (what exists today)

- `StellarClient` (`libs/stellar/src/client.ts`) is a single-asset wrapper: constructed once from `StellarClientConfig` (`network`, `sponsorSecret`, `assetCode`, `assetIssuer`, optional `horizonUrl`/`distributionWalletSecret`), holds one `Asset` for its whole lifetime. All sponsored methods (`sendFromSponsored`, `createSponsoredAccountsBatch`, `hasTrustline`, `getBalance`, etc.) operate on that one asset.
- Trustline creation lives in `libs/stellar/src/operations/account.ts`, always via `Operation.changeTrust({ asset: ctx.asset, ... })`. `createSponsoredAccountsBatch` classifies each account as `create` / `trustline-only` / `already-sponsored` and only adds what's missing — this is directly reusable for a second asset.
- Beneficiary RAHAT-token trustlines are created via: `EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT` → `StellarSponsorService.sponsorBeneficiaries` (`apps/aa/src/stellar-sponsor/stellar-sponsor.service.ts`) → batches jobs onto `BQUEUE.STELLAR_SPONSOR` → `StellarSponsorProcessor.sponsorAccountsBatch` (`apps/aa/src/stellar-sponsor/stellar-sponsor.processor.ts`) → `StellarClient.createSponsoredAccountsBatch`, built from `STELLAR_SPONSOR_SETTINGS` via a DI factory in `StellarSponsorModule`.
- `Inkind` / `GroupInkind` / `BeneficiaryInkindRedemption` (Prisma models, `schema.prisma:717-823`) have no asset/price fields today — `quantity` on `BeneficiaryInkindRedemption` is the only quantifiable value, always computed by the caller (`InkindsService`).
- `RedeemInkindDto` (`apps/aa/src/chain/interfaces/chain-service.interface.ts:122-126`) carries `beneficiaryAddress`, `inkindId: string[]`, `vendorAddress` — `vendorAddress` is currently unused by the Stellar implementation.
- Two call sites invoke `chainService.redeemInkind(...)`: `InkindsService.beneficiaryInkindRedeem` (online/vendor-scan path, supports both `PRE_DEFINED` and `WALK_IN`) and `InkindsService.processBulkBatch` (offline/bulk vendor path, `PRE_DEFINED` only).

## Planned changes

### 1. Settings

- Add `INKIND_ASSET_SETTINGS` as a new settings key with the same value shape as `STELLAR_SPONSOR_SETTINGS` (`network`, `sponsorSecret`, `assetCode`, `assetIssuer`, optional `horizonUrl`).
- `apps/aa/src/app/settings-sanitizer.ts:10-17`: add `INKIND_ASSET_SETTINGS: ['sponsorSecret']` to `SENSITIVE_SETTINGS_FIELDS` so the secret never leaks through the public settings API.

### 2. New module: eager trustline batch on group-assignment (mirrors `stellar-sponsor`)

Create `apps/aa/src/stellar-inkind/` with the same three-file shape as `apps/aa/src/stellar-sponsor/`:
- `stellar-inkind-trustline.module.ts` — registers `BullModule.registerQueue({ name: BQUEUE.STELLAR_INKIND_TRUSTLINE })` (new queue constant), and a DI provider `INKIND_STELLAR_CLIENT` built via factory from `INKIND_ASSET_SETTINGS`, exactly like `StellarSponsorModule`'s `STELLAR_CLIENT` factory.
- `stellar-inkind-trustline.service.ts` — `@OnEvent(EVENTS.GROUP_INKIND_ASSIGNED)` listener (new event constant), gated the same way as `StellarSponsorService.isSponsorshipEnabled` (chain type must be `'stellar'`, `INKIND_ASSET_SETTINGS` must be configured). Fetches the group's beneficiary wallets and batches jobs onto the new queue, modeled directly on `StellarSponsorService.sponsorBeneficiaries`.
- `stellar-inkind-trustline.processor.ts` — `@Process` handler modeled directly on `StellarSponsorProcessor.sponsorAccountsBatch`: resolve wallet secrets via `JOBS.WALLET.GET_BULK_SECRET_BY_WALLET`, call `inkindStellarClient.createSponsoredAccountsBatch(keypairs)` — this already no-ops accounts that exist without the inkind trustline into `trustline-only`, and skips accounts that already have it. No new Stellar operations needed. On success/failure, record onto `beneficiary.extras` under distinct field names (e.g. `inkindTrustlineCreated`, `inkindTrustlineError`) so it doesn't collide with the existing RAHAT sponsorship fields.

New constants (`apps/aa/src/constants/index.ts`):
- `BQUEUE.STELLAR_INKIND_TRUSTLINE`
- `JOBS.STELLAR.CREATE_INKIND_TRUSTLINE_BATCH`
- `EVENTS.GROUP_INKIND_ASSIGNED`
- `INKIND_STELLAR_CLIENT` DI token (alongside existing `STELLAR_CLIENT`)

Wire the new module into `AppModule`/wherever `StellarSponsorModule` is registered.

### 3. Emit the new event on group assignment

`apps/aa/src/inkinds/inkinds.service.ts:646-666` (`assignGroupInkind`, inside the `$transaction` that creates the `GroupInkind` + `LOCK` stock movement): after the transaction commits, emit `this.eventEmitter.emit(EVENTS.GROUP_INKIND_ASSIGNED, { groupUuid: groupId })` — same pattern as `BeneficiaryService.reserveTokenToGroup` emitting `EVENTS.GROUP_TOKEN_RESERVED_FOR_DISBURSE`. `EventEmitter2` is already injected into `InkindsService`. Note `assignGroupInkind` already rejects `InkindType.WALK_IN`, so this event only ever fires for `PRE_DEFINED` inkinds — matching the "predefined" half of the trustline-timing decision.

### 4. Pass redemption quantity through `RedeemInkindDto`

`apps/aa/src/chain/interfaces/chain-service.interface.ts:122-126`: add `quantity: number` to `RedeemInkindDto` (total units being redeemed in this call, across all `inkindId`s).

Update both call sites in `apps/aa/src/inkinds/inkinds.service.ts` to sum quantity before calling `redeemInkind`:
- `beneficiaryInkindRedeem` (~line 1687-1699): sum `redemptionResults` entries' `quantityRedeemed` (all entries share `beneficiaryAddress`/`walletAddress` here, so a single total is correct).
- `processBulkBatch` (~line 2446-2462): when grouping `inkindsByWallet`, also accumulate a running quantity total per wallet (from `validRedemptionsToInsert[i].quantity`) and pass it as `quantity` alongside `inkindId`.

`EvmChainService.redeemInkind` ignores the new field — no change needed there (it just forwards the whole DTO onto a queue job already).

### 5. Real transfer in `StellarChainService.redeemInkind`

Rewrite `apps/aa/src/chain/chain-services/stellar-chain.service.ts:817-843`:

1. Destructure `beneficiaryAddress`, `inkindId: inkinds`, `quantity` from the DTO.
2. Load `INKIND_ASSET_SETTINGS` via `this.getFromSettings(...)` (existing helper) and build `const inkindClient = new StellarClient(inkindAssetSettings as unknown as StellarClientConfig)` — same inline-construction style already used elsewhere in this file (e.g. `processSendAssetToVendor`, `sendOtpByPhone`).
3. **Lazy trustline (walk-in / defensive fallback)**: `if (!(await inkindClient.hasTrustline(beneficiaryAddress)))` — fetch the beneficiary's own secret via the existing wallet-based lookup (`this.client.send({ cmd: JOBS.WALLET.GET_BULK_SECRET_BY_WALLET }, { walletAddresses: [beneficiaryAddress], chain: 'stellar' })`, same call `transferOfflineRedemptionBatch` already makes), derive a `Keypair`, and call `inkindClient.createSponsoredAccountsBatch([keypair])`. This covers both the walk-in case and defensively covers any predefined-path account where the eager batch trustline step (§2) hasn't completed yet.
4. Transfer: `const result = await inkindClient.sendToSponsored(beneficiaryAddress, quantity.toString())` — sponsor sends `quantity` units of the inkind asset to the beneficiary as an on-chain redemption receipt (mirrors `sendToSponsored`'s existing role for RAHAT).
5. On success, call `this.inkindService.updateRedeemInkindTxHash(inkinds, result.hash, beneficiaryAddress)` (unchanged method) instead of the random hash.
6. On failure, `throw new RpcException(...)` without touching the redemption row — leaves `status: 'PENDING'`/`txHash: null` so it can be retried, matching the failure-handling convention in `processSendAssetToVendor`.
7. Drop the `generateRandomTxHash('stellar')` call and its now-unused import from this file — the utility itself stays (only used here today, but not part of this task to delete the shared util).

## Verification plan

- `npm run build` (or the `aa` app's build target) to confirm TS compiles across the interface change (`RedeemInkindDto.quantity`), new module, and constants.
- Manual/integration check against a Stellar testnet sandbox: assign a `PRE_DEFINED` inkind to a test group with sponsored beneficiaries → confirm the new batch job creates a trustline for `INKIND_ASSET_SETTINGS.assetCode`/`assetIssuer` on each beneficiary's account (check via Horizon `GET /accounts/{id}`). Then redeem it and confirm a real `sendToSponsored` transaction lands with the beneficiary's balance of the inkind asset incrementing by the redeemed quantity, and `BeneficiaryInkindRedemption.txHash` is a real Stellar tx hash, not a random one.
- Walk-in path: redeem a `WALK_IN` inkind for a beneficiary who has never had the inkind trustline created, and confirm `redeemInkind` creates the trustline inline before sending, without needing the group-assignment event.
- Run existing inkind/stellar test suites if present to ensure no regressions in the batch/event-emission paths touched.
