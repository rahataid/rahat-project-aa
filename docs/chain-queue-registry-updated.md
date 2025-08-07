# Chain Queue Registry System with Common Interfaces

## Overview

The Chain Queue Registry system provides a unified interface for queue operations across different blockchain types (EVM, Stellar), eliminating the need to manually manage queues and processors. This system mirrors the architecture of the existing Wallet system, providing automatic chain detection and routing with **common interfaces** for maximum consistency and extensibility.

## Problem Statement

### Before (Manual Queue Management) 😰

```typescript
// Manual queue injection and management
@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
@InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue,

// Manual chain detection
const chainSettings = await this.settingsService.getByName('CHAIN_SETTINGS');
const chainType = chainSettings.value.type;

// Manual chain-specific queue operations with different data formats
if (chainType === 'stellar') {
  const stellarData = { walletAddress: data.address, secretKey: data.key, amount: data.amount };
  stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarData);
} else if (chainType === 'evm') {
  const evmData = { size: 1, start: data.beneficiaryId, end: data.beneficiaryId };
  contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmData);
}
```

### After (Unified Interface with Common DTOs) 🚀

```typescript
// Simple service injection
constructor(private chainQueueService: ChainQueueService) {}

// Automatic chain detection and routing with standardized data
await this.chainQueueService.assignTokens({
  beneficiaryAddress: "G...",
  amount: 100,
});

await this.chainQueueService.disburse({
  beneficiaries: ["G...", "G..."],
  amounts: [100, 200],
  groupId: "group-123"
});
```

## Architecture Comparison

The Chain Queue Registry system follows the **exact same pattern** as the Wallet system with **common interfaces**:

| Component     | Wallet System                                  | Queue System                                    |
| ------------- | ---------------------------------------------- | ----------------------------------------------- |
| **Interface** | `IWalletManager`                               | `IChainService`                                 |
| **Registry**  | `BlockchainProviderRegistry`                   | `ChainServiceRegistry`                          |
| **Service**   | `WalletService`                                | `ChainQueueService`                             |
| **Module**    | `WalletModule`                                 | `ChainQueueModule`                              |
| **Providers** | `EVMWallet implements IWalletManager`          | `StellarChainService implements IChainService`  |
|               | `StellarWallet implements IWalletManager`      | `EvmChainService implements IChainService`      |
| **Detection** | `createWallet()` → auto-detects chain          | `assignTokens()` → auto-detects chain           |
| **Config**    | `register({ wallets: [...], defaultConfigs })` | `register({ services: [...], defaultConfigs })` |

## Implementation

### 1. Common Chain Service Interface

```typescript
// src/services/interfaces/chain-service.interface.ts
import { ChainType } from '@rahataid/wallet';

export interface IChainService {
  // Token operations
  assignTokens(data: AssignTokensDto): Promise<any>;
  transferTokens(data: TransferTokensDto): Promise<any>;

  // Disbursement operations
  disburse(data: DisburseDto): Promise<any>;
  getDisbursementStatus(id: string): Promise<any>;

  // Account operations
  fundAccount(data: FundAccountDto): Promise<any>;
  checkBalance(address: string): Promise<any>;

  // Authentication operations
  sendOtp(data: SendOtpDto): Promise<any>;
  verifyOtp(data: VerifyOtpDto): Promise<any>;

  // Trigger operations (optional for chains that support it)
  addTrigger?(data: AddTriggerDto): Promise<any>;
  updateTrigger?(data: UpdateTriggerDto): Promise<any>;

  // Utility methods
  validateAddress(address: string): boolean;
  getChainType(): ChainType;
}
```

### 2. Common Data Transfer Objects

```typescript
// src/services/dto/common.dto.ts
export interface AssignTokensDto {
  beneficiaryAddress: string;
  amount: number;
  tokenType?: string;
  metadata?: any;
}

export interface DisburseDto {
  beneficiaries: string[];
  amounts: number[];
  groupId?: string;
  metadata?: any;
}

export interface FundAccountDto {
  walletAddress: string;
  amount?: number;
  secretKey?: string;
}

export interface SendOtpDto {
  phoneNumber: string;
  amount: number;
  vendorAddress: string;
}
```

## Usage Examples

### Assign Tokens Comparison

```typescript
// BEFORE: Manual, Complex, Error-Prone 😰
@Injectable()
export class OldBeneficiaryService {
  constructor(@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue, @InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue, private settingsService: SettingsService) {}

  async assignTokensToBeneficiary(beneficiaryData: any) {
    // 😡 Manual chain detection
    const chainSettings = await this.settingsService.getByName('CHAIN_SETTINGS');
    const chainType = chainSettings.value.type;

    // 😡 Different data formats and job names for each chain
    if (chainType === 'stellar') {
      const stellarData = {
        walletAddress: beneficiaryData.walletAddress,
        secretKey: beneficiaryData.secretKey,
        amount: beneficiaryData.amount,
      };
      return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarData);
    } else if (chainType === 'evm') {
      const evmData = {
        size: beneficiaryData.batchSize || 20,
        start: beneficiaryData.startId,
        end: beneficiaryData.endId,
      };
      return this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmData);
    } else {
      throw new Error(`Unsupported chain: ${chainType}`);
    }
  }
}

// AFTER: Simple, Clean, Universal 🚀
@Injectable()
export class NewBeneficiaryService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async assignTokensToBeneficiary(beneficiaryData: AssignTokensDto) {
    // 🎉 One line, works everywhere, type-safe!
    return this.chainQueueService.assignTokens(beneficiaryData);
  }

  async assignTokensWithCustomChain(beneficiaryData: AssignTokensDto, chainType: ChainType) {
    // 🎉 Force specific chain if needed
    return this.chainQueueService.assignTokensOnChain(beneficiaryData, chainType);
  }
}
```

## Benefits

### 1. **Common Interface Benefits** ✨

- **Type Safety**: All chains implement the same interface
- **Consistent API**: Same method signatures across all chains
- **Easy Testing**: Mock the interface, not individual services
- **Enforced Standards**: TypeScript ensures all chains implement required methods

### 2. **Simplified Development** 🚀

- No need to inject multiple queues or services
- No manual chain detection logic
- Single service for all queue operations
- Universal method signatures

### 3. **Future-Proof Architecture** 🔮

- Easy to add new blockchains by implementing `IChainService`
- Minimal code changes for new chains
- Optional methods handle chain-specific features

## Configuration

### Module Integration

```typescript
// In your main module (e.g., AppModule)
@Module({
  imports: [
    ChainQueueModule, // 🎉 Import once, use everywhere
    // ... other modules
  ],
})
export class AppModule {}
```

## Adding New Chains

Adding a new blockchain is simple - just implement the interface!

```typescript
// Example: Adding Bitcoin support
@Injectable()
export class BitcoinChainService implements IChainService {
  static readonly blockchainType = 'BITCOIN';

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // Bitcoin-specific implementation
    const bitcoinData = {
      address: data.beneficiaryAddress,
      satoshis: data.amount * 100000000,
    };
    return this.bitcoinQueue.add('SEND_BITCOIN', bitcoinData);
  }

  validateAddress(address: string): boolean {
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
  }

  getChainType(): ChainType {
    return 'bitcoin';
  }

  // ... implement all required methods
}
```

## Conclusion

The Chain Queue Registry system with **common interfaces** provides the cleanest, most maintainable solution for multi-chain queue operations. By following the exact same architectural patterns as the successful Wallet system, it ensures consistency, type safety, and ease of use across the entire application.

**Usage is as simple as:**

```typescript
// Just inject and use - no worrying about chains, queues, or data formats!
await this.chainQueueService.assignTokens({ beneficiaryAddress: '...', amount: 100 });
```
