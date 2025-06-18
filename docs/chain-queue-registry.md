# Chain Queue Registry System

## Overview

The Chain Queue Registry system provides a unified interface for queue operations across different blockchain types (EVM, Stellar), eliminating the need to manually manage queues and processors. This system mirrors the architecture of the existing Wallet system, providing automatic chain detection and routing.

## Problem Statement

### Before (Manual Queue Management)

```typescript
// Manual queue injection and management
@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
@InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue,

// Manual chain-specific queue operations
if (chainType === 'stellar') {
  stellarQueue.add(JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE, data);
} else if (chainType === 'evm') {
  contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, data);
}
```

### After (Unified Queue Interface)

```typescript
// Simple service injection
constructor(private chainQueueService: ChainQueueService) {}

// Automatic chain detection and routing
await this.chainQueueService.disburse(data);
await this.chainQueueService.assignTokens(data);
```

## Architecture Comparison

The Chain Queue Registry system follows the exact same pattern as the Wallet system:

| Component     | Wallet System                                    | Queue System                                     |
| ------------- | ------------------------------------------------ | ------------------------------------------------ |
| **Registry**  | `BlockchainProviderRegistry`                     | `ChainQueueRegistry`                             |
| **Service**   | `WalletService`                                  | `ChainQueueService`                              |
| **Module**    | `WalletModule`                                   | `ChainQueueModule`                               |
| **Providers** | `EVMWallet`, `StellarWallet`                     | `StellarProcessor`, `ContractProcessor`          |
| **Detection** | `createWallet()` → auto-detects chain            | `disburse()` → auto-detects chain                |
| **Config**    | `defaultConfigs: { evm: {...}, stellar: {...} }` | `defaultConfigs: { evm: {...}, stellar: {...} }` |

## Implementation

### 1. Chain Queue Registry

```typescript
// src/queue/providers/chain-queue.registry.ts
import { Provider } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { SettingsService } from '@rumsan/settings';
import { ChainType } from '@rahataid/wallet';

export const CHAIN_QUEUE_REGISTRY_TOKEN = 'CHAIN_QUEUE_REGISTRY';

type ProcessorClass = any;
type QueueConfig = { name: string; concurrency?: number };

interface QueueRegistryConfig {
  processors: ProcessorClass[];
  queues: QueueConfig[];
  defaultConfigs?: Record<string, { queueName: string; jobs: any }>;
}

export class ChainQueueRegistry {
  private queueManagers = new Map<string, Queue>();
  private processorConfigs = new Map<ChainType, any>();
  private settingsService: SettingsService;

  constructor(queueMap: Map<string, Queue>, defaultConfigs: Record<string, any> = {}, settingsService: SettingsService) {
    this.queueManagers = queueMap;
    this.settingsService = settingsService;
    this.registerProcessorConfigs(defaultConfigs);
  }

  // Static method for NestJS module registration
  static register(config: QueueRegistryConfig): Provider[] {
    return [
      // Register all Bull queues
      ...config.queues.map((queueConfig) =>
        BullModule.registerQueue({
          name: queueConfig.name,
          ...(queueConfig.concurrency && {
            processors: [{ concurrency: queueConfig.concurrency }],
          }),
        })
      ),
      {
        provide: CHAIN_QUEUE_REGISTRY_TOKEN,
        useFactory: async (settingsService: SettingsService, ...queues: Queue[]) => {
          // Create queue map
          const queueMap = new Map<string, Queue>();
          config.queues.forEach((queueConfig, index) => {
            queueMap.set(queueConfig.name, queues[index]);
          });

          return new ChainQueueRegistry(queueMap, config.defaultConfigs || {}, settingsService);
        },
        inject: [SettingsService, ...config.queues.map((q) => getQueueToken(q.name))],
      },
    ];
  }

  private registerProcessorConfigs(defaultConfigs: Record<string, any>): void {
    Object.entries(defaultConfigs).forEach(([chainType, config]) => {
      this.processorConfigs.set(chainType as ChainType, config);
    });
  }

  async addToQueue(operation: string, data: any, chainType?: ChainType): Promise<any> {
    const chain = chainType || (await this.detectChainType());
    const config = this.processorConfigs.get(chain);

    if (!config) {
      throw new Error(`No configuration found for chain type: ${chain}`);
    }

    const queue = this.queueManagers.get(config.queueName);
    if (!queue) {
      throw new Error(`No queue found for chain type: ${chain}`);
    }

    const jobName = config.jobs[operation];
    if (!jobName) {
      throw new Error(`No job mapping found for operation: ${operation} on chain: ${chain}`);
    }

    return queue.add(jobName, data);
  }

  private async detectChainType(): Promise<ChainType> {
    const settings = await this.settingsService.getByName('CHAIN_SETTINGS');
    if (!settings?.value?.type) {
      throw new Error('Chain configuration not found in CHAIN_SETTINGS');
    }
    return settings.value.type as ChainType;
  }

  getSupportedChains(): ChainType[] {
    return Array.from(this.processorConfigs.keys());
  }

  getQueueForChain(chainType: ChainType): Queue | undefined {
    const config = this.processorConfigs.get(chainType);
    return config ? this.queueManagers.get(config.queueName) : undefined;
  }
}
```

### 2. Chain Queue Service

```typescript
// src/queue/chain-queue.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainType } from '@rahataid/wallet';
import { DisburseDto, AddTriggerDto, SendOtpDto, TransferToOfframpDto } from '../stellar/dto';
import { ChainQueueRegistry, CHAIN_QUEUE_REGISTRY_TOKEN } from './providers/chain-queue.registry';

@Injectable()
export class ChainQueueService {
  private readonly logger = new Logger(ChainQueueService.name);

  constructor(
    @Inject(CHAIN_QUEUE_REGISTRY_TOKEN)
    private readonly queueRegistry: ChainQueueRegistry
  ) {}

  // Unified queue operations - automatically detect chain and route
  async disburse(data: DisburseDto): Promise<any> {
    this.logger.log('Adding disbursement to queue');
    return this.queueRegistry.addToQueue('DISBURSE', data);
  }

  async assignTokens(data: any): Promise<any> {
    this.logger.log('Adding token assignment to queue');
    return this.queueRegistry.addToQueue('ASSIGN_TOKEN', data);
  }

  async addTrigger(data: AddTriggerDto | AddTriggerDto[]): Promise<any> {
    this.logger.log('Adding trigger to queue');
    return this.queueRegistry.addToQueue('ADD_TRIGGER', data);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    this.logger.log('Adding OTP send to queue');
    return this.queueRegistry.addToQueue('SEND_OTP', data);
  }

  async transferToOfframp(data: TransferToOfframpDto): Promise<any> {
    this.logger.log('Adding offramp transfer to queue');
    return this.queueRegistry.addToQueue('TRANSFER_TO_OFFRAMP', data);
  }

  async fundAccount(data: any): Promise<any> {
    this.logger.log('Adding account funding to queue');
    return this.queueRegistry.addToQueue('FUND_ACCOUNT', data);
  }

  async checkTrustline(data: any): Promise<any> {
    this.logger.log('Adding trustline check to queue');
    return this.queueRegistry.addToQueue('CHECK_TRUSTLINE', data);
  }

  // Force specific chain operations (when needed)
  async disburseOnChain(data: DisburseDto, chainType: ChainType): Promise<any> {
    this.logger.log(`Adding disbursement to ${chainType} queue`);
    return this.queueRegistry.addToQueue('DISBURSE', data, chainType);
  }

  async assignTokensOnChain(data: any, chainType: ChainType): Promise<any> {
    this.logger.log(`Adding token assignment to ${chainType} queue`);
    return this.queueRegistry.addToQueue('ASSIGN_TOKEN', data, chainType);
  }

  // Utility methods
  async getDefaultChain(): Promise<ChainType> {
    // Return the configured default chain
    const supportedChains = this.queueRegistry.getSupportedChains();
    return supportedChains[0]; // Return first supported chain as default
  }

  getSupportedChains(): ChainType[] {
    return this.queueRegistry.getSupportedChains();
  }
}
```

### 3. Chain Queue Module

```typescript
// src/queue/chain-queue.module.ts
import { Global, Module } from '@nestjs/common';
import { SettingsModule } from '@rumsan/settings';
import { StellarProcessor } from '../processors/stellar.processor';
import { ContractProcessor } from '../processors/contract.processor';
import { ChainQueueService } from './chain-queue.service';
import { ChainQueueRegistry } from './providers/chain-queue.registry';
import { BQUEUE, JOBS } from '../constants';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [
    ChainQueueService,
    ...ChainQueueRegistry.register({
      processors: [StellarProcessor, ContractProcessor],
      queues: [
        { name: BQUEUE.STELLAR, concurrency: 10 },
        { name: BQUEUE.CONTRACT, concurrency: 5 },
        { name: BQUEUE.STELLAR_CHECK_TRUSTLINE, concurrency: 20 },
      ],
      defaultConfigs: {
        stellar: {
          queueName: BQUEUE.STELLAR,
          jobs: {
            DISBURSE: JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE,
            ASSIGN_TOKEN: JOBS.STELLAR.ASSIGN_TOKENS,
            ADD_TRIGGER: JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE,
            SEND_OTP: JOBS.STELLAR.SEND_OTP,
            TRANSFER_TO_OFFRAMP: JOBS.STELLAR.TRANSFER_TO_OFFRAMP,
            FUND_ACCOUNT: JOBS.STELLAR.FAUCET_TRUSTLINE,
            CHECK_TRUSTLINE: JOBS.STELLAR.CHECK_TRUSTLINE,
          },
        },
        evm: {
          queueName: BQUEUE.CONTRACT,
          jobs: {
            DISBURSE: JOBS.CONTRACT.DISBURSE,
            ASSIGN_TOKEN: JOBS.PAYOUT.ASSIGN_TOKEN,
            ADD_TRIGGER: JOBS.CONTRACT.ADD_TRIGGER,
            FUND_ACCOUNT: JOBS.CONTRACT.FUND_ACCOUNT,
          },
        },
      },
    }),
  ],
  exports: [ChainQueueService],
})
export class ChainQueueModule {}
```

## Usage Examples

### 1. Basic Usage (Recommended)

```typescript
// In any service
@Injectable()
export class BeneficiaryService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async processDisbursement(disburseData: DisburseDto) {
    // Automatically detects chain and routes to correct processor
    return this.chainQueueService.disburse(disburseData);
  }

  async assignTokensToBeneficiaries(tokenData: any) {
    // No need to know about Stellar vs EVM - handled automatically
    return this.chainQueueService.assignTokens(tokenData);
  }

  async sendOtpToBeneficiary(otpData: SendOtpDto) {
    // Works regardless of underlying blockchain
    return this.chainQueueService.sendOtp(otpData);
  }
}
```

### 2. Chain-Specific Operations (When Needed)

```typescript
// Force specific chain operations
@Injectable()
export class AdvancedService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async processMultiChainDisbursement(data: DisburseDto) {
    // Process on both chains if needed
    const stellarResult = await this.chainQueueService.disburseOnChain(data, 'stellar');
    const evmResult = await this.chainQueueService.disburseOnChain(data, 'evm');

    return { stellar: stellarResult, evm: evmResult };
  }

  async getChainInfo() {
    const defaultChain = await this.chainQueueService.getDefaultChain();
    const supportedChains = this.chainQueueService.getSupportedChains();

    return { defaultChain, supportedChains };
  }
}
```

### 3. Migration from Existing Code

```typescript
// BEFORE: Manual queue management
@Injectable()
export class OldService {
  constructor(@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue, @InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue) {}

  async oldDisburse(data: DisburseDto) {
    // Manual chain detection and queue selection
    const chainType = await this.detectChain();
    if (chainType === 'stellar') {
      return this.stellarQueue.add(JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE, data);
    } else {
      return this.contractQueue.add(JOBS.CONTRACT.DISBURSE, data);
    }
  }
}

// AFTER: Unified queue service
@Injectable()
export class NewService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async newDisburse(data: DisburseDto) {
    // Clean, simple, automatic
    return this.chainQueueService.disburse(data);
  }
}
```

## Configuration

### Chain Settings

The system uses the existing `CHAIN_SETTINGS` configuration:

```json
{
  "type": "stellar",
  "rpcUrl": "https://stellar-soroban-public.nodies.app",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

or

```json
{
  "type": "evm",
  "rpcUrl": "https://base-sepolia-rpc.publicnode.com",
  "chainId": 84532
}
```

### Module Integration

```typescript
// In your main module (e.g., AppModule)
@Module({
  imports: [
    ChainQueueModule, // Import once, use everywhere
    // ... other modules
  ],
})
export class AppModule {}
```

## Benefits

### 1. **Simplified Development**

- No need to inject multiple queues
- No manual chain detection logic
- Single service for all queue operations

### 2. **Consistent Architecture**

- Mirrors the proven wallet system design
- Familiar patterns for developers
- Easy to understand and maintain

### 3. **Future-Proof**

- Easy to add new blockchains (Bitcoin, Solana, etc.)
- Centralized configuration management
- Minimal code changes required

### 4. **Error Reduction**

- Eliminates manual queue selection errors
- Automatic data transformation
- Type-safe operations

### 5. **Testing Benefits**

- Mock single service instead of multiple queues
- Consistent testing patterns
- Easier unit test setup

## Testing

### Unit Testing

```typescript
describe('ChainQueueService', () => {
  let service: ChainQueueService;
  let mockRegistry: jest.Mocked<ChainQueueRegistry>;

  beforeEach(async () => {
    const mockRegistryProvider = {
      provide: CHAIN_QUEUE_REGISTRY_TOKEN,
      useValue: {
        addToQueue: jest.fn(),
        getSupportedChains: jest.fn().mockReturnValue(['stellar', 'evm']),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChainQueueService, mockRegistryProvider],
    }).compile();

    service = module.get<ChainQueueService>(ChainQueueService);
    mockRegistry = module.get(CHAIN_QUEUE_REGISTRY_TOKEN);
  });

  it('should call disburse with correct parameters', async () => {
    const testData = { amount: 100 };
    await service.disburse(testData);

    expect(mockRegistry.addToQueue).toHaveBeenCalledWith('DISBURSE', testData);
  });
});
```

### Integration Testing

```typescript
describe('ChainQueueModule Integration', () => {
  let app: INestApplication;
  let queueService: ChainQueueService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ChainQueueModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    queueService = moduleFixture.get<ChainQueueService>(ChainQueueService);
    await app.init();
  });

  it('should automatically route to correct queue based on chain settings', async () => {
    // Test auto-routing functionality
    const result = await queueService.disburse({ amount: 100 });
    expect(result).toBeDefined();
  });
});
```

## Migration Guide

### Step 1: Install the Module

```typescript
// Add to your main module
@Module({
  imports: [
    ChainQueueModule,
    // ... existing modules
  ],
})
export class AppModule {}
```

### Step 2: Replace Queue Injections

```typescript
// REMOVE these injections
@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
@InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue,

// ADD this injection
private readonly chainQueueService: ChainQueueService
```

### Step 3: Replace Queue Operations

```typescript
// REPLACE manual queue operations
stellarQueue.add(JOBS.STELLAR.DISBURSE, data);

// WITH unified service calls
chainQueueService.disburse(data);
```

### Step 4: Remove Chain Detection Logic

```typescript
// REMOVE manual chain detection
const chainType = await this.detectChain();
if (chainType === 'stellar') { ... }

// REPLACE with automatic detection
await this.chainQueueService.disburse(data);
```

## Future Enhancements

### 1. **Additional Blockchain Support**

```typescript
// Easy to add new chains
defaultConfigs: {
  stellar: { ... },
  evm: { ... },
  bitcoin: {
    queueName: BQUEUE.BITCOIN,
    jobs: JOBS.BITCOIN,
  },
  solana: {
    queueName: BQUEUE.SOLANA,
    jobs: JOBS.SOLANA,
  },
}
```

### 2. **Queue Monitoring**

```typescript
// Add monitoring capabilities
async getQueueStats(): Promise<QueueStats> {
  return this.queueRegistry.getStats();
}
```

### 3. **Batch Operations**

```typescript
// Support for batch operations
async batchDisburse(data: DisburseDto[]): Promise<any[]> {
  return this.queueRegistry.addBatchToQueue('DISBURSE', data);
}
```

### 4. **Queue Health Checks**

```typescript
// Health monitoring
async healthCheck(): Promise<HealthStatus> {
  return this.queueRegistry.checkHealth();
}
```

## Conclusion

The Chain Queue Registry system provides a clean, unified interface for queue operations that automatically handles chain detection and routing. By following the same architectural patterns as the successful Wallet system, it ensures consistency, maintainability, and ease of use across the entire application.

This approach eliminates the complexity of manual queue management while maintaining flexibility for advanced use cases, making it the ideal solution for multi-chain queue operations.
