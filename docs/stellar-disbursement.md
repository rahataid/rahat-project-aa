# Stellar Disbursement Platform (SDP) Integration

## Overview

The Rahat AA project integrates with [Stellar's Disbursement Platform (SDP)](https://stellar.org/disbursement-platform) to perform bulk token disbursements to beneficiaries on the Stellar blockchain. SDP handles the complexity of creating Stellar transactions, managing receiver wallets, and tracking payment statuses, while the Rahat system orchestrates the process through a queue-based, event-driven architecture.

---

## Architecture

```
                          +--------------------------+
                          |    External Client /      |
                          |    Rahat Triggers         |
                          +------------|-------------+
                                       |
                          MessagePattern: aa.jobs.chain.disburse
                                       |
                          +------------|-------------+
                          |    ChainController       |
                          |    (chain.controller.ts) |
                          +------------|-------------+
                                       |
                          +------------|-------------+
                          |    ChainService          |
                          |    (chain.service.ts)     |
                          +------------|-------------+
                                       |
                          +------------|-------------+
                          |  ChainQueueService       |
                          |  (chain-queue.service.ts) |
                          +------------|-------------+
                                       |
                          +------------|-------------+
                          | ChainServiceRegistry     |
                          | Detects chain type:       |
                          |   stellar | evm           |
                          +------|------------|------+
                                 |            |
                    +------------|--+   +-----|----------+
                    | StellarChain  |   | EvmChain       |
                    | Service       |   | Service        |
                    +-------|-------+   +----------------+
                            |
                   Bull Queue: STELLAR_SDP
                            |
                    +-------|-------+
                    | SdpStellar    |
                    | Processor     |
                    +-------|-------+
                            |
                    +-------|-------+
                    | SDP REST API  |
                    | (External)    |
                    +---------------+
```

---

## SDP Library (`@rahataid/stellar-sdp`)

### Location

`libs/stellar-sdp/src/`

### What It Is

A local TypeScript SDK that wraps the Stellar Disbursement Platform REST API. It provides typed service classes for every SDP domain and handles authentication, tenant headers, and multipart CSV uploads.

### SdpClient

The entry point is the `SdpClient` class (`libs/stellar-sdp/src/sdp-client.ts`). It initializes an Axios HTTP instance with Bearer token auth and tenant headers, then exposes domain-specific services:

| Service              | Description                                      |
|----------------------|--------------------------------------------------|
| `auth`               | Login, MFA, password reset, token refresh         |
| `tenants`            | Tenant CRUD (Admin API)                           |
| `organization`       | Organization details and logo                     |
| `apiKeys`            | API key management with permissions               |
| `assets`             | Create and list Stellar assets                    |
| `receivers`          | Manage receivers, wallets, verifications           |
| `disbursements`      | Create/update disbursements, upload CSV            |
| `payments`           | Direct payments, retry failed payments             |
| `statistics`         | Disbursement and overall statistics                |
| `balances`           | Query asset balances                               |

### Authentication

The library supports two HTTP instances:

- **User Instance** (`create-user-instance.ts`): Adds `Authorization: Bearer {token}` and `SDP-Tenant-Name: {tenantName}` headers. Used for all standard operations.
- **Admin Instance** (`create-admin-instance.ts`): Uses HTTP Basic Auth (`Authorization: Basic {base64(username:apiKey)}`). Used for tenant management.

### Configuration

```typescript
new SdpClient({
  sdpUrl: 'https://sdp-api.example.com',  // SDP server URL
  tenantName: 'rahat-tenant',              // Multi-tenant identifier
  apiKey: 'your-api-key',                  // API key auth (simplest)
  // OR use token-based auth:
  // auth: { token: '...', email: '...', password: '...' }
  // OR admin auth:
  // sdpAdminUrl: '...', adminAuth: { username: '...', apiKey: '...' }
  timeout: 15000,                          // Request timeout (default: 15s)
});
```

---

## Multi-Chain Management

### Chain Service Registry

The project supports multiple blockchains through an abstraction layer.

**File:** `apps/aa/src/chain/registries/chain-service.registry.ts`

The `ChainServiceRegistry` maintains a map of chain implementations:

```
stellar -> StellarChainService  (uses SDP for disbursements)
evm     -> EvmChainService      (uses smart contracts for disbursements)
```

### How Chain Type Is Detected

1. **From database settings:** Reads `CHAIN_SETTINGS` from the settings table. The `type` field determines the chain (`stellar` or `evm`).
2. **By wallet address format:**
   - Stellar: 56 characters, starts with `G`
   - EVM: 42 characters, starts with `0x`
3. **Default fallback:** `evm` if no configuration found.

### IChainService Interface

Both `StellarChainService` and `EvmChainService` implement the same `IChainService` interface, ensuring the rest of the application is chain-agnostic. The interface includes methods like `disburse()`, `assignTokens()`, `transferTokens()`, `checkBalance()`, etc.

When `CHAIN_SETTINGS.type = 'stellar'`, all disbursement operations route through SDP. When `type = 'evm'`, they route through EVM smart contract interactions instead.

---

## SDP Settings Configuration

### Database Storage

SDP configuration is stored in the database `settings` table under the name `SDP_SETTINGS`.

**Seed script:** `prisma/seed-sdp-settings.ts`

### Required Environment Variables

| Variable                   | Description                              |
|----------------------------|------------------------------------------|
| `SDP_URL`                  | SDP server base URL                      |
| `SDP_TENANT_NAME`          | Tenant identifier in SDP                 |
| `SDP_API_KEY`              | API key for authentication               |
| `SDP_WALLET_ID`            | Wallet ID used for disbursements         |
| `SDP_ASSET_ID`             | Stellar asset code to disburse           |
| `SDP_VERIFICATION_FIELD`   | Field used for receiver verification     |

### Settings Structure (stored in DB)

```json
{
  "sdpUrl": "https://sdp-api.example.com",
  "tenantName": "rahat-tenant",
  "apiKey": "your-api-key",
  "walletId": "wallet-uuid",
  "assetId": "USDC",
  "verificationField": "phone_number"
}
```

---

## Disbursement Flow: `aa.jobs.chain.disburse`

This section traces the complete execution path from the moment `aa.jobs.chain.disburse` is triggered to the final status update.

### Step 1: Entry Point (ChainController)

**File:** `apps/aa/src/chain/chain.controller.ts`

A NestJS microservice message pattern receives the disbursement request:

```typescript
@MessagePattern({
  cmd: 'aa.jobs.chain.disburse',
  uuid: process.env.PROJECT_ID,
})
disburse(data: any) {
  return this.chainService.disburse(data);
}
```

The `uuid` field scopes the pattern to this specific project instance, enabling multi-project deployments on the same message broker.

### Step 2: Service Delegation (ChainService -> ChainQueueService)

**Files:** `chain.service.ts` -> `chain-queue.service.ts`

`ChainService` is a thin delegation layer. `ChainQueueService` uses the `ChainServiceRegistry` to resolve the correct chain implementation:

```typescript
async disburse(data: DisburseDto, chainType?: ChainType): Promise<any> {
  const chainService = await this.chainServiceRegistry.getChainService(chainType);
  return chainService.disburse(data);
}
```

### Step 3: Stellar Chain Service

**File:** `apps/aa/src/chain/chain-services/stellar-chain.service.ts`

When the chain is `stellar`, `StellarChainService.disburse()` executes:

1. **Resolve groups:** If `data.groups` is provided, use those UUIDs. Otherwise, query all disbursable groups (groups with reserved tokens that haven't been disbursed yet: `numberOfTokens > 0`, `isDisbursed = false`, no existing payout).

2. **Queue jobs per group:** For each group that has a token reservation, enqueue a Bull job to the `STELLAR_SDP` queue:

```typescript
await this.stellarSdpQueue.add(
  JOBS.STELLAR_SDP.DISBURSE,              // 'aa.jobs.stellar_sdp.disburse'
  { dName, groups: [uuid] },
  { attempts: 3, delay: 2000, backoff: { type: 'exponential', delay: 1000 } }
);
```

3. **Return immediately** with the list of queued groups and their `PENDING` status. The actual disbursement happens asynchronously.

### Step 4: SDP Processor - Disbursement Job

**File:** `apps/aa/src/processors/sdp-stellar.processor.ts`

The `SdpStellarProcessor` processes jobs from the `STELLAR_SDP` Bull queue with **concurrency: 1** (one job at a time).

#### `handleDisburse` Flow:

```
Job Data: { dName: string, groups: [groupUuid] }
                    |
    1. Fetch token reservation from DB
                    |
    2. Fetch beneficiary data (phone, walletAddress, amount)
                    |
    3. Generate CSV buffer
                    |
    4. Initialize SdpClient from SDP_SETTINGS
                    |
    5. Call sdpClient.disbursements.create() with CSV
                    |
    6. Update disbursement status to STARTED via SDP API
                    |
    7. Update local DB: status='STARTED', store disbursement info
                    |
    8. Queue DISBURSEMENT_STATUS_UPDATE job (3-min delay)
```

#### CSV Generation

The CSV is generated from beneficiary data with the following format:

```csv
phone,walletAddress,walletAddressMemo,id,amount,paymentID
"+9779841234567","GABCD...XYZ","","RECEIVER_beneficiary-uuid","100","PAY_beneficiary-uuid_12345"
```

- **phone**: Beneficiary's phone number
- **walletAddress**: Stellar public key
- **walletAddressMemo**: Empty (reserved for memo-based routing)
- **id**: Prefixed with `RECEIVER_` + beneficiary UUID
- **amount**: Token amount per beneficiary (total group tokens / number of beneficiaries)
- **paymentID**: Prefixed with `PAY_` + beneficiary UUID + random number

Amount validation ensures each beneficiary receives >= 1 token.

#### SDP API Call (Create Disbursement)

```typescript
const disbursement = await sdpClient.disbursements.create({
  name: dName,
  wallet_id: sdpSettings.walletId,
  asset_id: sdpSettings.assetId,
  registration_contact_type: 'PHONE_NUMBER_AND_WALLET_ADDRESS',
  verification_field: sdpSettings.verificationField,
  receiver_registration_message_template: '',
  file: csvBuffer,
  filename: `${dName}_instructions.csv`,
});
```

The `DisbursementsService.create()` method sends a multipart/form-data POST to `/disbursements` with the CSV file and metadata.

### Step 5: Status Polling

After creating the disbursement and setting it to `STARTED`, the processor queues a status check job with a **3-minute delay**:

```typescript
await this.stellarSdpQueue.add(
  JOBS.STELLAR_SDP.DISBURSEMENT_STATUS_UPDATE,
  { disbursementId, groupUuid, startedAt: Date.now() },
  { delay: 180000, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
);
```

#### `handleStatusUpdate` Flow:

```
Poll SDP API: GET /disbursements/{id}
                    |
            Check status
           /        |        \
    COMPLETED     FAILED    IN PROGRESS
        |         /ERROR         |
        |           |            |
  Update DB:    Update DB:    Elapsed > 24h?
  isDisbursed   status=        /        \
  = true        FAILED       YES        NO
        |           |          |          |
  Emit event    Stop       Mark as    Re-queue
  TOKEN_                   FAILED     (3-min delay)
  DISBURSED
```

**Timeout:** If the disbursement hasn't completed within **24 hours**, it's automatically marked as `FAILED`.

### Step 6: Completion Event

When SDP reports `COMPLETED`, the processor:

1. Updates the `beneficiaryGroupTokens` record: `status: 'DISBURSED'`, `isDisbursed: true`
2. Emits the `events.token_disbursed` event via `EventEmitter2`
3. Downstream listeners (e.g., `StatsProcessor`) handle post-disbursement updates like beneficiary token statistics

---

## Error Handling

| Scenario                              | Behavior                                              |
|---------------------------------------|-------------------------------------------------------|
| No token reservation for group        | Job skipped, warning logged                           |
| No beneficiaries in group             | Job skipped, warning logged                           |
| Invalid amount (< 1)                  | `RpcException` thrown during CSV generation            |
| SDP API error                         | Group marked `FAILED` with error details in DB         |
| SDP status = FAILED/ERROR             | Group marked `FAILED`, polling stops                   |
| Polling exceeds 24 hours              | Group marked `FAILED` with timeout error               |
| Job failure (any exception)           | Bull retries up to 3 times with exponential backoff    |
| SDP_SETTINGS not found                | Error thrown, job fails                                |

---

## Queue Configuration

| Queue Name                          | Purpose                              | Concurrency |
|-------------------------------------|--------------------------------------|-------------|
| `STELLAR_SDP_{PROJECT_ID}`          | SDP disbursement + status polling    | 1           |
| `EVM_TX_{PROJECT_ID}`               | EVM write transactions               | 1           |
| `EVM_QUERY_{PROJECT_ID}`            | EVM read queries                     | 5           |

All queues use Redis as the backend (configured via `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`) and are scoped by `PROJECT_ID` to support multi-project deployments.

---

## Key Files Reference

| Component                | Path                                                          |
|--------------------------|---------------------------------------------------------------|
| Chain Controller         | `apps/aa/src/chain/chain.controller.ts`                       |
| Chain Service            | `apps/aa/src/chain/chain.service.ts`                          |
| Chain Queue Service      | `apps/aa/src/chain/chain-queue.service.ts`                    |
| Chain Service Registry   | `apps/aa/src/chain/registries/chain-service.registry.ts`      |
| Stellar Chain Service    | `apps/aa/src/chain/chain-services/stellar-chain.service.ts`   |
| EVM Chain Service        | `apps/aa/src/chain/chain-services/evm-chain.service.ts`       |
| SDP Processor            | `apps/aa/src/processors/sdp-stellar.processor.ts`             |
| SDP Client Library       | `libs/stellar-sdp/src/sdp-client.ts`                         |
| Disbursements Service    | `libs/stellar-sdp/src/services/disbursements.service.ts`      |
| SDP Settings Seed        | `prisma/seed-sdp-settings.ts`                                 |
| Constants (Jobs/Queues)  | `apps/aa/src/constants/index.ts`                              |

---

## Summary

1. `aa.jobs.chain.disburse` is received via NestJS microservice message pattern
2. The `ChainServiceRegistry` detects the chain type from DB settings
3. For Stellar, `StellarChainService` resolves disbursable beneficiary groups and queues one Bull job per group
4. The `SdpStellarProcessor` generates a CSV from beneficiary data and uploads it to the SDP API
5. SDP creates and starts the disbursement on the Stellar network
6. A polling loop checks SDP status every 3 minutes (up to 24 hours)
7. On completion, local records are updated and a `TOKEN_DISBURSED` event is emitted
