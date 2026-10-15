# Settings reference

Catalog of runtime config read via `SettingsService.getPublic(key)` (see [coding-patterns.md](./coding-patterns.md) rule 5 — this is the only sanctioned way to read a tunable value, never hardcode/env-read inline). Covers what each key holds, which `prisma/seed-*.ts` populates it, and who consumes it.

**Before adding any new settings key that stores a credential, secret, or private key: read `apps/aa/src/app/settings-sanitizer.ts` first** and add an entry to its `SENSITIVE_SETTINGS_FIELDS` map. See the "Sanitizer coverage" section below — it currently has real gaps, don't assume it already covers your new key just because it exists.

## How it works

- Settings live in the `Setting` Prisma table (`name`, `value: Json`, `dataType`, `isPrivate`, `isReadOnly`, `requiredFields`).
- Seeded via `prisma/seed-*.ts` scripts, one (or a closely related group) per settings key — e.g. `seed-evm-chainsettings.ts` → `CHAIN_SETTINGS`, `seed-sdp-settings.ts` → `SDP_SETTINGS`.
- Read in app code via `SettingsService.getPublic(name)` (sometimes wrapped — `getFromSettings()` in `stellar-chain.service.ts`, `appService.getSettings({name})` in `app.service.ts`).
- Exposed externally over the microservice transport (see [transport-and-multitenancy.md](./transport-and-multitenancy.md)) via two `@MessagePattern`s in `app.controller.ts`: `JOBS.SETTINGS.LIST` → `listSettings()` (all settings) and `JOBS.SETTINGS.GET` → `getSettings(dto)` (one key by name).

## Known settings keys

| Key | Holds | Seeded by | Used by |
|---|---|---|---|
| `CHAIN_SETTINGS` | Active chain type (`evm`/`stellar`) + chain config, **`privateKey`** (deployer/operator key) | `seed-evm-chainsettings.ts`, `seed-stellar-chainsettings.ts` | `chain-service.registry.ts` (chain detection), `evm-chain.service.ts`, `evm-centralized.processor.ts`, `stellar-chain.service.ts`, `stellar-sponsor.service.ts` |
| `STELLAR_SETTINGS` | General Stellar network config | `seed-stellar.ts` | Stellar flows generally |
| `STELLAR_SPONSOR_SETTINGS` | Sponsor wallet config, **`sponsorSecret`** | `seed-stellar-sponsor-settings.ts` | `stellar-sponsor.service.ts`, `stellar-chain.service.ts` (trustline/return-tokens fee payer) |
| `STELLAR_INKIND_SETTINGS` | In-kind distribution wallet, **`distribution_wallet_secret_key`** | (no dedicated seed file found — check before assuming one exists) | `stellar-chain.service.ts` (`initializeInkindClient`) |
| `STELLAR_DISBURSEMENT_SETTINGS` | Disbursement mode (`DIRECT`/`SDP`), **`STELLAR_DISTRUBUTION_WALLET_SECRET`** (DIRECT mode only) | (no dedicated seed file found) | `stellar-chain.service.ts` (`getDisbursementSettings`, `returnTokensToDistributionWallet`), `sdp-stellar.processor.ts` |
| `SDP_SETTINGS` | SDP API config: `sdpUrl`, `tenantName`, **`apiKey`**, `walletId`, `assetId`, `verificationField` | `seed-sdp-settings.ts` | `stellar-chain.service.ts` (`getSdpDistributionAccount`, SdpClient construction) |
| `OFFRAMP_SETTINGS` | FSP/CIPS payment provider config: `url`, `appId`, **`accessToken`** | `seed-offramp.ts` | `offramp.service.ts` |
| `DISBURSED_ON_CREATE` | Boolean feature toggle | `seed-disbursed-on-create-settings.ts` | `listeners.service.ts` (disburse-on-create path) |
| `PROJECTINFO` | Project name, `PROJECT_TYPE` (drives stats calculator selection) | `seed-project.ts` | `stats-calculation.service.ts`, `payouts.service.ts` (notification text) |
| `CONTRACT` | EVM contract addresses (CashToken/RahatToken/AAProject/etc) — addresses, not secrets | (part of chain/EVM seed) | `fundallocation.service.ts`, `utils/web3.ts` consumers |
| `ENTITIES` / `INKIND_ENTITIES` | Cash-tracker smart-address entities, each with **`privateKey`** | cash-tracker setup (no single seed file identified) | `cash-tracker.module.ts`, `cash-tracker.service.ts` |
| `CLOUDFLARE_R2` | R2 object storage config: account id, bucket, domain, **`R2_ACCESS_KEY_ID`**, **`R2_SECRET_ACCESS_KEY`** | `seed-r2-settings.ts` | QR/PDF storage (`qr-pdf.service.ts` and friends) |
| `DISBURSHMENT_METHODS` | Available disbursement method config | `seed-disbursement-methods.ts` | payout/disbursement UI-facing config |
| `FUNDMANAGEMENT_TAB_CONFIG`, `FORECAST_TAB_CONFIG`, `PROJECT_NAV_CONFIG`, `PAYOUT_TYPE_CONFIG` | Frontend tab/nav/config shapes, no secrets | respective `seed-*.ts` | surfaced to rahat-platform frontend via settings |
| `DATASOURCE` | Forecast datasource config (DHM/GLOFAS-style) | `seed-karnali.ts`, `seed-babai.ts` (per-watershed) | forecast/trigger ingestion |
| `SUBGRAPH_URL` / `CASHTRACKER_SUBGRAPH_URL` | Indexer (`apps/graph`) endpoint URLs | — | query-side reads of on-chain state |

This table is seeded from a grep pass (`getPublic`/`getFromSettings` call sites + `prisma/seed-*.ts`), not an exhaustive static analysis — if you add or rename a settings key, add/update its row here (see AGENT.md's "keeping docs in sync" rule).

## Sanitizer coverage — read before adding a secret-bearing key

`apps/aa/src/app/settings-sanitizer.ts`'s `SENSITIVE_SETTINGS_FIELDS` currently lists exactly three keys:

```ts
STELLAR_SPONSOR_SETTINGS: ['sponsorSecret'],
STELLAR_INKIND_SETTINGS: ['distribution_wallet_secret_key'],
CHAIN_SETTINGS: ['privateKey'],
```

**Confirmed gaps as of this doc's last update** — settings keys above that hold a credential/secret field but are *not* in this map, so that field is not stripped when exposed:

- `STELLAR_DISBURSEMENT_SETTINGS.STELLAR_DISTRUBUTION_WALLET_SECRET`
- `SDP_SETTINGS.apiKey`
- `OFFRAMP_SETTINGS.accessToken`
- `CLOUDFLARE_R2.R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `ENTITIES` / `INKIND_ENTITIES` — each entry's `privateKey`, and structurally different from the others besides: these are **arrays** of objects, while `sanitizeSettingValue` strips fields off a single flat `value` object. Even adding these key names to the map as currently written would not sanitize an array shape correctly — the sanitizer function itself would need an array-aware branch.

**Also note**: the sanitizer (`sanitizeSettingValue`) is only ever called from `AppService.listSettings()` (the bulk `JOBS.SETTINGS.LIST` handler). `AppService.getSettings(dto)` (`JOBS.SETTINGS.GET`, single-key lookup) calls `settingService.getPublic(name)` directly and returns it **unsanitized**, regardless of which key is requested. Any of the secret fields above — including the three already in the sanitizer map — are returned in full through the single-key lookup path.

This is a real, currently-unfixed gap, not a hypothetical — flagging it here rather than silently patching it, since the fix (extend the map, handle array shapes, and decide whether `getSettings` should sanitize too) touches security-sensitive code that should be a deliberate change, not a side effect of a docs pass.

_Last updated: 2026-10-15_
