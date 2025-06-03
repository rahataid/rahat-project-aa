# Disbursement Migration Plan: Chain-Agnostic (Stellar + EVM)

## Overview

This document outlines the step-by-step plan to migrate the current Stellar-based disbursement logic to a chain-agnostic system that supports both Stellar and EVM (Ethereum and EVM-compatible chains). The goal is to abstract blockchain operations, enable plug-and-play disbursement adapters, and maintain a unified interface for wallet management, token disbursement, trigger management, fund management, and triggers management.

## Current State

- **Stellar-specific logic** is implemented in `StellarService` (`src/stellar/stellar.service.ts`).
- **No EVM support** exists yet.
- **No chain-agnostic interface** is currently in place.
- **Payouts logic** (`payouts.service.ts`) is not blockchain-specific but delegates to Stellar.

## Migration Goals

1. **Define a chain-agnostic interface** for disbursement operations.
2. **Refactor Stellar logic** to implement this interface.
3. **Add EVM support** as a new module.
4. **Create a dispatcher/router** to route requests to the correct module.
5. **Update controllers and services** to use the new interface.
6. **Standardize DTOs and types** for both chains.
7. **Implement robust configuration management** for chain selection.
8. **Ensure security, error handling, and observability**.
9. **Write comprehensive tests** for both chains and the dispatcher.
10. **Document the new system** for maintainers and integrators.
11. **Deploy and roll out** the changes safely.
12. **Plan for ongoing maintenance** and future chain integrations.

## Detailed Migration Steps

### 1. Define the Chain-Agnostic Interface

**File:** `src/disbursement/disbursement.interface.ts`

**Actions:**
- Create a new interface (e.g., `IDisbursementModule`) that abstracts all blockchain operations.
- Include methods for wallet creation, token disbursement, trigger management, and fund queries.
- Ensure the interface is generic enough to support both Stellar and EVM.

**Example:**
```typescript
export interface IDisbursementModule {
  createWallet(dto: CreateWalletDto): Promise<WalletResult>;
  fundWallet(dto: FundWalletDto): Promise<TxResult>;
  disburseTokens(dto: DisburseDto): Promise<TxResult>;
  getWalletBalance(dto: WalletBalanceDto): Promise<BalanceResult>;
  addTrigger(dto: AddTriggerDto): Promise<TriggerResult>;
  updateTrigger(dto: UpdateTriggerDto): Promise<TriggerResult>;
  getTrigger(dto: GetTriggerDto): Promise<TriggerResult>;
  // ...other methods as needed
}
```

### 2. Refactor Stellar Logic

**File:** `src/disbursement/stellar.disbursement.service.ts`

**Actions:**
- Move/rename `StellarService` to `stellar.disbursement.service.ts`.
- Refactor to implement the new `IDisbursementModule` interface.
- Remove direct dependencies on Stellar-specific libraries (e.g., `@stellar/stellar-sdk`) from controllers and services.
- Update all methods to match the interface.

**Affected Files:**
- `src/stellar/stellar.service.ts`
- `src/stellar/stellar.controller.ts`
- `src/stellar/stellar.module.ts`
- `src/beneficiary/beneficiary.module.ts`
- `src/processors/processors.module.ts`
- `src/app/app.module.ts`

### 3. Implement EVM Logic

**File:** `src/disbursement/evm.disbursement.service.ts`

**Actions:**
- Create a new service that implements `IDisbursementModule`.
- Use `ethers.js` or `web3.js` for EVM interactions.
- Implement all interface methods (wallet creation, token disbursement, triggers, etc.).
- Ensure robust error handling, gas estimation, and nonce management.

**Affected Files:**
- None (new file).

### 4. Create a Dispatcher/Router

**File:** `src/disbursement/disbursement.dispatcher.ts`

**Actions:**
- Create a dispatcher service that routes requests to the correct module (Stellar or EVM).
- Use dependency injection for both modules.
- On each call, check project config (from DB or settings) to determine which module to use.

**Example:**
```typescript
@Injectable()
export class DisbursementDispatcher implements IDisbursementModule {
  constructor(
    private readonly stellar: StellarDisbursementService,
    private readonly evm: EvmDisbursementService,
    private readonly configService: ConfigService,
  ) {}

  private getModule(chain: 'stellar' | 'evm'): IDisbursementModule {
    // Logic to select module based on config
    return chain === 'stellar' ? this.stellar : this.evm;
  }

  async createWallet(dto: CreateWalletDto) {
    return this.getModule(dto.chain).createWallet(dto);
  }
  // ...repeat for all interface methods
}
```

**Affected Files:**
- None (new file).

### 5. Update Controllers and Services

**Actions:**
- Refactor all usages of `StellarService` to use `DisbursementDispatcher`.
- Remove any direct Stellar/EVM logic from controllers.

**Affected Files:**
- `src/stellar/stellar.controller.ts`
- `src/beneficiary/beneficiary.service.ts`
- `src/processors/stellar.processor.ts`
- Any other file that directly uses `StellarService`.

### 6. Standardize DTOs and Types

**Actions:**
- Refactor DTOs in `src/dto/` and `src/stellar/dto/` to be generic.
- Add a `chain` field where needed.
- Create base DTOs and extend for chain-specific needs.

**Affected Files:**
- `src/stellar/dto/send-otp.dto.ts`
- `src/stellar/dto/trigger.dto.ts`
- `src/stellar/dto/disburse.dto.ts`
- Any other DTOs used in blockchain operations.

### 7. Configuration Management

**Actions:**
- Store chain selection in project config (DB or `.env`).
- Expose an admin setting to change the default chain per project.

**Affected Files:**
- `src/app/app.module.ts` (for config service)
- Any settings or config files.

### 8. Testing

**Actions:**
- Write unit tests for each module (`stellar.disbursement.service.ts`, `evm.disbursement.service.ts`, `disbursement.dispatcher.ts`).
- Write integration tests for the dispatcher.
- Use testnets for EVM and Stellar in CI.

**Affected Files:**
- `src/stellar/stellar.service.spec.ts`
- `src/stellar/stellar.controller.spec.ts`
- Any other test files that mock `StellarService`.

### 9. Documentation

**Actions:**
- Document the interface, each module, and the dispatcher.
- Provide setup instructions for both chains.
- Document configuration and environment variables.

**Affected Files:**
- `docs/` (or wherever your documentation lives).

### 10. Deployment and Rollout

**Actions:**
- Deploy in a staging environment first.
- Migrate existing data/configs to support chain selection.
- Monitor logs and metrics for issues.

**Affected Files:**
- CI/CD configs, deployment scripts.

### 11. Ongoing Maintenance

**Actions:**
- Keep the interface generic.
- Add new modules as needed, plug into the dispatcher.

**Affected Files:**
- None (ongoing process).

## Summary Table of Affected Files

| Step | Action | Affected Files |
|------|--------|----------------|
| 1 | Define interface | `src/disbursement/disbursement.interface.ts` |
| 2 | Refactor Stellar | `src/stellar/stellar.service.ts`, `src/stellar/stellar.controller.ts`, `src/stellar/stellar.module.ts`, `src/beneficiary/beneficiary.module.ts`, `src/processors/processors.module.ts`, `src/app/app.module.ts` |
| 3 | Implement EVM | `src/disbursement/evm.disbursement.service.ts` (new) |
| 4 | Dispatcher | `src/disbursement/disbursement.dispatcher.ts` (new) |
| 5 | Update controllers | `src/stellar/stellar.controller.ts`, `src/beneficiary/beneficiary.service.ts`, `src/processors/stellar.processor.ts` |
| 6 | Standardize DTOs | `src/stellar/dto/send-otp.dto.ts`, `src/stellar/dto/trigger.dto.ts`, `src/stellar/dto/disburse.dto.ts` |
| 7 | Config management | `src/app/app.module.ts`, settings files |
| 8 | Testing | `src/stellar/stellar.service.spec.ts`, `src/stellar/stellar.controller.spec.ts` |
| 9 | Documentation | `docs/` |
| 10 | Deployment | CI/CD configs |
| 11 | Maintenance | Ongoing |

## Next Steps

- Review and approve this migration plan.
- Start with defining the interface and refactoring Stellar logic.
- Proceed with EVM implementation and dispatcher.
- Update controllers and services.
- Test thoroughly in a staging environment.
- Deploy and monitor.

## Projects and Aspects Covered

- **@rahat-platform**:
  - **Files**: `src/stellar/stellar.service.ts`, `src/stellar/stellar.controller.ts`, `src/stellar/stellar.module.ts`, `src/beneficiary/beneficiary.module.ts`, `src/processors/processors.module.ts`, `src/app/app.module.ts`, `src/stellar/dto/send-otp.dto.ts`, `src/stellar/dto/trigger.dto.ts`, `src/stellar/dto/disburse.dto.ts`, `src/stellar/stellar.service.spec.ts`, `src/stellar/stellar.controller.spec.ts`, `docs/`.
  - **Changes**: Refactor Stellar logic, implement EVM support, create dispatcher, update controllers, standardize DTOs, manage configuration, write tests, document, deploy, and maintain.

- **@rahat-project-aa**:
  - **Files**: `src/stellar/stellar.service.ts`, `src/stellar/stellar.controller.ts`, `src/stellar/stellar.module.ts`, `src/beneficiary/beneficiary.module.ts`, `src/processors/processors.module.ts`, `src/app/app.module.ts`, `src/stellar/dto/send-otp.dto.ts`, `src/stellar/dto/trigger.dto.ts`, `src/stellar/dto/disburse.dto.ts`, `src/stellar/stellar.service.spec.ts`, `src/stellar/stellar.controller.spec.ts`, `docs/`.
  - **Changes**: Refactor Stellar logic, implement EVM support, create dispatcher, update controllers, standardize DTOs, manage configuration, write tests, document, deploy, and maintain.

- **@rahat-project-triggers**:
  - **Files**: `src/stellar/stellar.service.ts`, `src/stellar/stellar.controller.ts`, `src/stellar/stellar.module.ts`, `src/beneficiary/beneficiary.module.ts`, `src/processors/processors.module.ts`, `src/app/app.module.ts`, `src/stellar/dto/send-otp.dto.ts`, `src/stellar/dto/trigger.dto.ts`, `src/stellar/dto/disburse.dto.ts`, `src/stellar/stellar.service.spec.ts`, `src/stellar/stellar.controller.spec.ts`, `docs/`.
  - **Changes**: Refactor Stellar logic, implement EVM support, create dispatcher, update controllers, standardize DTOs, manage configuration, write tests, document, deploy, and maintain.

