# Stellar Account Sponsorship

## Overview

When a beneficiary group is added to a project, the sponsorship flow automatically creates and funds Stellar accounts for each beneficiary. A designated **sponsor account** covers the base reserve (XLM minimum balance) so beneficiaries do not need to hold any XLM themselves.

---

## Flow Diagram

```
BENEFICIARY_GROUP_ADDED_TO_PROJECT event
            │
            ▼
  StellarSponsorService
  ├─ Check STELLAR_SPONSOR_SETTINGS → if missing, skip + debug log
  ├─ Fetch beneficiaries + wallet addresses from DB (Prisma)
  └─ Split into batches of 12
            │
            ▼ (per batch)
  Bull Queue: STELLAR_SPONSOR_{PROJECT_ID}
            │
            ▼
  StellarSponsorProcessor (concurrency: 1)
  ├─ Fetch wallet secrets from rahat-platform
  │      └─ microservice: rahat.jobs.wallet.getBulkSecretByWallet
  │              └─ payload: { walletAddresses: string[], chain: 'stellar' }
  │              └─ returns: { address, privateKey }[]
  ├─ Build Stellar Keypairs from secrets
  ├─ Call stellarClient.createSponsoredAccountsBatch(keypairs)
  │      └─ submits sponsorship transaction to Stellar network
  └─ Update beneficiary records in DB
         └─ extras.stellarSponsored = true
         └─ extras.stellarPublicKey = <public key>
```

---

## Data Sources

| Data | Source | How |
|------|--------|-----|
| Beneficiary wallet addresses | Local DB (`beneficiary` table) | `prisma.beneficiary.findMany` — `walletAddress` field |
| Wallet private keys | `rahat-platform` wallet service | Microservice call: `rahat.jobs.wallet.getBulkSecretByWallet` over Redis transport |
| Sponsor account secret | `STELLAR_SPONSOR_SETTINGS` (DB setting) | `SettingsService.getPublic('STELLAR_SPONSOR_SETTINGS')` → `sponsorSecret` |
| Stellar network config | `STELLAR_SPONSOR_SETTINGS` | `network`, `horizonUrl`, `assetCode`, `assetIssuer` |

---

## Settings

### `STELLAR_SPONSOR_SETTINGS`
Stored in the `Setting` table. Required for sponsorship to activate.

```json
{
  "network": "testnet",
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "sponsorSecret": "<sponsor account secret key>",
  "sponsorPublicKey": "<sponsor account public key>",
  "assetCode": "RAHAT",
  "assetIssuer": "<issuer public key>"
}
```

Seed script: `prisma/seed-stellar-sponsor-settings.ts`

### `CHAIN_SETTINGS`
Used only at startup for the warning check. If `type === 'stellar'` and `STELLAR_SPONSOR_SETTINGS` is absent, a warning is logged.

```json
{
  "type": "stellar",
  "name": "stellar test chain",
  "rpcUrl": "...",
  "chainId": "Test SDF Network ; September 2015"
}
```

---

## Key Files

| File | Role |
|------|------|
| `apps/aa/src/stellar-sponsor/stellar-sponsor.service.ts` | Listens to event, validates settings, batches beneficiaries, enqueues jobs |
| `apps/aa/src/stellar-sponsor/stellar-sponsor.processor.ts` | Processes each batch — fetches secrets, sponsors accounts, updates DB |
| `apps/aa/src/stellar-sponsor/stellar-sponsor.module.ts` | Wires up Bull queue, Redis client, StellarClient factory |
| `apps/aa/src/constants/index.ts` | `JOBS.WALLET.GET_BULK_SECRET_BY_WALLET`, `BQUEUE.STELLAR_SPONSOR`, `STELLAR_SPONSOR_BATCH_SIZE` (12) |
| `libs/stellar/src/client.ts` | `StellarClient.createSponsoredAccountsBatch()` — Stellar SDK wrapper |
| `prisma/seed-stellar-sponsor-settings.ts` | Seeds `STELLAR_SPONSOR_SETTINGS` from env vars |

**Handler in rahat-platform:**
`apps/rahat/src/wallet/wallet.controller.ts` → `getBulkSecretByWallet`
`apps/rahat/src/wallet/wallet.service.ts` → iterates wallet addresses, returns `WalletKeys[]`

---

## Why Batches of 12?

Stellar sponsorship transactions bundle multiple account creations into a single transaction. The batch size (`STELLAR_SPONSOR_BATCH_SIZE = 12`) is kept small to stay within Stellar's per-transaction operation limit and to avoid holding large numbers of secrets in memory simultaneously.

Each batch is an independent Bull job processed one at a time (`concurrency: 1`) to prevent nonce/sequence conflicts on the sponsor account.

---

## Startup Behaviour

On application bootstrap, `StellarSponsorService` checks both settings:

- If `STELLAR_SPONSOR_SETTINGS` is present → silent, module is active
- If `STELLAR_SPONSOR_SETTINGS` is missing AND `CHAIN_SETTINGS.type === 'stellar'` → logs a `WARN` to prompt the operator to add the setting
- If `STELLAR_SPONSOR_SETTINGS` is missing at event time → event is silently ignored (debug log only)

---

## Adding Sponsorship to a New Environment

1. Set env vars: `STELLAR_SPONSOR_SECRET`, `STELLAR_NETWORK`, `STELLAR_HORIZON_URL`, `STELLAR_ASSET_CODE`, `STELLAR_ASSET_ISSUER`
2. Run: `npx ts-node prisma/seed-stellar-sponsor-settings.ts`
3. Ensure the sponsor account is funded with enough XLM to cover base reserves for expected beneficiary volume
4. Restart the AA service — the `StellarSponsorModule` will pick up the new settings on next bootstrap
