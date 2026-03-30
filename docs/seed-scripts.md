# Seed Scripts

This document describes all seed scripts located in the [`prisma/`](../prisma/) directory. These scripts populate the database with initial configuration required for the Rahat Anticipatory Action project.

## Overview

Seed scripts use `@rumsan/settings` `SettingsService` to upsert key-value configuration into the database. Most scripts can run standalone via `ts-node` or be imported as functions into other scripts.

---

## Scripts

### `seed.ts` — Main Seed Entry Point

**Run:** `pnpm seed:all`

Orchestrates the full base seed in sequence:

1. Creates `HAZARD_TYPE` setting (`River Flood`)
2. Creates `SCB` (Standard Chartered Bank) settings from environment variables
3. Calls [`seedProject`](#seed-projectts--project-info)
4. Calls [`seedStellar`](#seed-stellarts--stellar-settings)
5. Calls [`seedOfframp`](#seed-offrampts--offramp-payment-provider)

**Required environment variables:**

| Variable | Description |
|---|---|
| `SCB_BASE_URL` | Base URL for the SCB API |
| `SCB_ACCESS_TOKEN` | Access token for the SCB API |
| `ACTIVE_YEAR` | Active year for the project (required by sub-seeds) |
| `RIVER_BASIN` | River basin name (required by sub-seeds) |

---

### `seed-project.ts` — Project Info

**Run:** `ts-node prisma/seed-project.ts`
**Exported function:** `seedProject()`

Upserts the `PROJECTINFO` setting with the active year and river basin. Deletes any existing `PROJECTINFO` before recreating it.

**Required environment variables:**

| Variable | Description |
|---|---|
| `ACTIVE_YEAR` | The active operational year (e.g. `2025`) |
| `RIVER_BASIN` | The target river basin name (e.g. `Karnali`) |

**Setting created:**

```json
{
  "name": "PROJECTINFO",
  "value": {
    "ACTIVE_YEAR": "<ACTIVE_YEAR>",
    "RIVER_BASIN": "<RIVER_BASIN>"
  }
}
```

---

### `seed-stellar.ts` — Stellar Settings

**Run:** `pnpm seed:stellar` or `ts-node prisma/seed-stellar.ts`
**Exported function:** `seedStellar()`

Upserts the `STELLAR_SETTINGS` setting with Stellar network configuration (testnet by default). Deletes any existing `STELLAR_SETTINGS` before recreating it.

**Required environment variables:**

| Variable | Description |
|---|---|
| `ACTIVE_YEAR` | The active operational year |
| `RIVER_BASIN` | The target river basin name |

**Setting created:** `STELLAR_SETTINGS` — includes server URL, keypair, contract ID, vendor address, asset code, SDP base URLs, Horizon URL, asset issuer, and network configuration.

> **Note:** The default configuration targets `testnet`. Update the values in the script before running against production.

---

### `seed-offramp.ts` — Offramp Payment Provider

**Run:** `ts-node prisma/seed-offramp.ts`
**Exported function:** `seedOfframp()`

Upserts the `OFFRAMP_SETTINGS` setting with the offramp payment provider configuration. Deletes any existing `OFFRAMP_SETTINGS` before recreating it.

**Optional environment variables:**

| Variable | Default | Description |
|---|---|---|
| `PAYMENT_PROVIDER_URL` | `https://api-offramp-dev.rahat.io/v1` | Base URL for the offramp payment provider |

**Setting created:**

```json
{
  "name": "OFFRAMP_SETTINGS",
  "value": {
    "url": "<PAYMENT_PROVIDER_URL>",
    "appId": "f3af9d3a-3e6e-4542-b768-d9758a4fe750",
    "accessToken": "sk_test_1234567890"
  }
}
```

---

### `seed-babai.ts` — Babai River Basin Data Source

**Run:** `ts-node prisma/seed-babai.ts`

Seeds the `DATASOURCE` setting with DHM and GLOFAS data source configuration for the **Babai at Chepang** monitoring station.

**No environment variables required.**

**Setting created:** `DATASOURCE` — DHM URL (`https://bipadportal.gov.np/api/v1`) and GLOFAS OWS URL with the bounding box and grid coordinates for the Babai station (`i=89`, `j=409`).

---

### `seed-karnali.ts` — Karnali River Basin Data Source

**Run:** `ts-node prisma/seed-karnali.ts`

Seeds the `DATASOURCE` setting with DHM and GLOFAS data source configuration for the **Karnali at Chisapani** monitoring station.

**No environment variables required.**

**Setting created:** `DATASOURCE` — DHM URL (`https://bipadportal.gov.np/api/v1`) and GLOFAS OWS URL with the bounding box and grid coordinates for the Karnali station (`i=721`, `j=303`).

> **Note:** Run either `seed-babai.ts` or `seed-karnali.ts` depending on the river basin being configured — not both, as they write to the same `DATASOURCE` key.

---

### `seed-forecast-tab.ts` — Forecast Tab Configuration

**Run:** `ts-node prisma/seed-forecast-tab.ts`
**Exported function:** `seedForecastTabConfig()`

Upserts the `FORECAST_TAB_CONFIG` setting that controls which tabs are shown in the Forecast Data UI section.

**No environment variables required.**

**Tabs configured:**

| Label | Value | Notes |
|---|---|---|
| DHM | `dhm` | |
| GLOFAS | `glofas` | |
| Daily Monitoring | `dailyMonitoring` | |
| Gauge Reading | `gaugeReading` | Has date picker |
| Google Flood Hub | `gfh` | |
| ExternalLinks | `externalLinks` | |

---

### `seed-fundmangement-tab.ts` — Fund Management Tab Configuration

**Run:** `ts-node prisma/seed-fundmangement-tab.ts`
**Exported function:** `seedFundManagementTabConfig()`

Upserts the `FUNDMANAGEMENT_TAB_CONFIG` setting that controls which tabs are shown in the Fund Management UI section.

**No environment variables required.**

**Tabs configured:**

| Label | Value |
|---|---|
| Cash Tracker | `cashTracker` |
| Tokens Overview | `tokenOverview` |
| Fund Management List | `fundManagementList` |
| In Kind Tracker | `inKindTracker` |
| Counselling | `counselling` |
| InKind | `inKind` |

---

### `seed-payout-config.ts` — Payout Type Configuration

**Run:** `ts-node prisma/seed-payout-config.ts`
**Exported function:** `seedPayoutTypeConfig()`

Upserts the `PAYOUT_TYPE_CONFIG` setting that defines the available payout types.

**No environment variables required.**

**Payout types configured:**

| Key | Label | Notes |
|---|---|---|
| `FSP` | FSP | Has payout method |
| `CVA` | CVA | Has toggle |

---

### `seed-project-nav.ts` — Project Navigation Configuration

**Run:** `ts-node prisma/seed-project-nav.ts`
**Exported function:** `seedProjectNavConfig()`

Upserts the `PROJECT_NAV_CONFIG` setting that defines the sidebar navigation structure and role-based visibility for the project UI.

**No environment variables required.**

**Navigation items configured:**

| Title | Path | Roles |
|---|---|---|
| Dashboard | *(root)* | ADMIN, MANAGER, UNICEF_DONOR, UNICEF_FIELD_OFFICE, UNICEF_HEAD_OFFICE |
| Project Beneficiaries | `beneficiary` | All |
| Stakeholders | `stakeholders` | All |
| Forecast Data | `data-sources` | All |
| Activities | `activities` | All |
| Trigger Statements | `trigger-statements` | All |
| Fund Management | `fund-management` | ADMIN, MANAGER, UNICEF_DONOR, UNICEF_FIELD_OFFICE, UNICEF_HEAD_OFFICE |
| Payout | `payout` | ADMIN, MANAGER |
| Vendors | `vendors` | ADMIN, MANAGER |
| Communication Logs | `communication-logs` | ADMIN, MANAGER |
| Grievances | `grievances` | All |

---

## Summary Table

| Script | npm Script | Setting Key | Requires Env Vars |
|---|---|---|---|
| `seed.ts` | `pnpm seed:all` | `HAZARD_TYPE`, `SCB` + sub-seeds | Yes |
| `seed-project.ts` | — | `PROJECTINFO` | Yes |
| `seed-stellar.ts` | `pnpm seed:stellar` | `STELLAR_SETTINGS` | Yes |
| `seed-offramp.ts` | — | `OFFRAMP_SETTINGS` | Optional |
| `seed-babai.ts` | — | `DATASOURCE` | No |
| `seed-karnali.ts` | — | `DATASOURCE` | No |
| `seed-forecast-tab.ts` | — | `FORECAST_TAB_CONFIG` | No |
| `seed-fundmangement-tab.ts` | — | `FUNDMANAGEMENT_TAB_CONFIG` | No |
| `seed-payout-config.ts` | — | `PAYOUT_TYPE_CONFIG` | No |
| `seed-project-nav.ts` | — | `PROJECT_NAV_CONFIG` | No |
