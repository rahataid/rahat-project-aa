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

export interface TransferTokensDto {
  fromAddress: string;
  toAddress: string;
  amount: number;
  tokenType?: string;
}

export interface VerifyOtpDto {
  phoneNumber: string;
  otp: string;
  transactionData: any;
}

export interface AddTriggerDto {
  id: string;
  trigger_type: string;
  phase: string;
  title: string;
  source: string;
  params: any;
}

export interface UpdateTriggerDto {
  id: string;
  params?: any;
  source?: string;
  isTriggered?: boolean;
}
```

### 3. Stellar Chain Service Implementation

```typescript
// src/services/stellar-chain.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ChainType } from '@rahataid/wallet';
import { IChainService } from './interfaces/chain-service.interface';
import { BQUEUE, JOBS } from '../constants';

@Injectable()
export class StellarChainService implements IChainService {
  static readonly blockchainType = 'STELLAR'; // For auto-registration

  constructor(@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue, @InjectQueue(BQUEUE.STELLAR_CHECK_TRUSTLINE) private trustlineQueue: Queue, private stellarService: StellarService) {}

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // 🎉 Transform common DTO to Stellar-specific format internally
    const stellarData = {
      walletAddress: data.beneficiaryAddress,
      secretKey: await this.getSecretKey(data.beneficiaryAddress),
      amount: data.amount,
    };

    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarData);
  }

  async disburse(data: DisburseDto): Promise<any> {
    // 🎉 Transform to Stellar disbursement format
    const stellarDisburseData = {
      groups: [data.groupId],
      beneficiaries: data.beneficiaries,
      amounts: data.amounts,
    };

    return this.stellarQueue.add(JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE, stellarDisburseData);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.SEND_OTP, data);
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, data);
  }

  async checkBalance(address: string): Promise<any> {
    return this.stellarService.getRahatBalance(address);
  }

  validateAddress(address: string): boolean {
    return /^G[A-Z2-7]{55}$/.test(address);
  }

  getChainType(): ChainType {
    return 'stellar';
  }

  // 🎉 Stellar-specific features
  async addTrigger(data: AddTriggerDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE, data);
  }

  async updateTrigger(data: UpdateTriggerDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE, data);
  }

  // Implementation details
  async transferTokens(data: TransferTokensDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.TRANSFER_TOKENS, data);
  }

  async getDisbursementStatus(id: string): Promise<any> {
    return this.stellarService.getDisbursement(id);
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    return this.stellarQueue.add(JOBS.STELLAR.VERIFY_OTP, data);
  }

  private async getSecretKey(address: string): Promise<string> {
    const keys = await this.stellarService.getSecretByWallet(address);
    return keys?.privateKey || '';
  }
}
```

### 4. EVM Chain Service Implementation

```typescript
// src/services/evm-chain.service.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ChainType } from '@rahataid/wallet';
import { IChainService } from './interfaces/chain-service.interface';
import { BQUEUE, JOBS } from '../constants';

@Injectable()
export class EvmChainService implements IChainService {
  static readonly blockchainType = 'EVM'; // For auto-registration

  constructor(@InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue, private beneficiaryService: BeneficiaryService) {}

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // 🎉 Transform common DTO to EVM batch format internally
    const beneficiaryId = await this.getBeneficiaryId(data.beneficiaryAddress);
    const evmData = {
      size: 1,
      start: beneficiaryId,
      end: beneficiaryId,
    };

    return this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmData);
  }

  async disburse(data: DisburseDto): Promise<any> {
    // 🎉 Transform to EVM contract format
    const evmDisburseData = {
      addresses: data.beneficiaries,
      amounts: data.amounts,
      groupId: data.groupId,
    };

    return this.contractQueue.add(JOBS.CONTRACT.DISBURSE, evmDisburseData);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    // 🎉 EVM gracefully handles unsupported features
    throw new Error('OTP not supported on EVM chain');
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    return this.contractQueue.add(JOBS.CONTRACT.FUND_ACCOUNT, data);
  }

  async checkBalance(address: string): Promise<any> {
    return this.getEthBalance(address);
  }

  validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  getChainType(): ChainType {
    return 'evm';
  }

  // 🎉 EVM doesn't support triggers - graceful handling
  async addTrigger(data: AddTriggerDto): Promise<any> {
    throw new Error('Triggers not supported on EVM chain');
  }

  async updateTrigger(data: UpdateTriggerDto): Promise<any> {
    throw new Error('Trigger updates not supported on EVM chain');
  }

  // Implementation details
  async transferTokens(data: TransferTokensDto): Promise<any> {
    const transferData = {
      from: data.fromAddress,
      to: data.toAddress,
      amount: data.amount,
    };
    return this.contractQueue.add(JOBS.CONTRACT.TRANSFER_TOKENS, transferData);
  }

  async getDisbursementStatus(id: string): Promise<any> {
    return this.contractQueue.add(JOBS.CONTRACT.GET_DISBURSEMENT_STATUS, { id });
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    throw new Error('OTP verification not supported on EVM chain');
  }

  private async getBeneficiaryId(address: string): Promise<number> {
    return this.beneficiaryService.getIdByAddress(address);
  }

  private async getEthBalance(address: string): Promise<any> {
    return { balance: 0, tokenBalance: 0 };
  }
}
```

### 5. Chain Service Registry

```typescript
// src/services/providers/chain-service.registry.ts
import { Provider } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import { ChainType } from '@rahataid/wallet';
import { IChainService } from '../interfaces/chain-service.interface';

export const CHAIN_SERVICE_REGISTRY_TOKEN = 'CHAIN_SERVICE_REGISTRY';

type ChainServiceClass = new (...args: any[]) => IChainService;

interface ServiceRegistryConfig {
  services: ChainServiceClass[];
  defaultConfigs?: Record<string, any>;
}

export class ChainServiceRegistry {
  private chainServices = new Map<ChainType, IChainService>();

  constructor(services: Map<ChainType, IChainService>, private settingsService: SettingsService) {
    this.chainServices = services;
  }

  // 🎉 Same registration pattern as BlockchainProviderRegistry
  static register(config: ServiceRegistryConfig): Provider[] {
    return [
      {
        provide: CHAIN_SERVICE_REGISTRY_TOKEN,
        useFactory: async (settingsService: SettingsService, ...serviceInstances: IChainService[]) => {
          const serviceMap = new Map<ChainType, IChainService>();

          // 🎉 Auto-detect chain types from service classes
          config.services.forEach((ServiceClass, index) => {
            const blockchainType = (ServiceClass as any).blockchainType.toLowerCase();
            serviceMap.set(blockchainType as ChainType, serviceInstances[index]);
          });

          return new ChainServiceRegistry(serviceMap, settingsService);
        },
        inject: [
          SettingsService,
          ...config.services, // Inject all service instances
        ],
      },
    ];
  }

  async getService(chainType?: ChainType): Promise<IChainService> {
    const chain = chainType || (await this.detectChainType());
    const service = this.chainServices.get(chain);

    if (!service) {
      throw new Error(`No service found for chain type: ${chain}`);
    }

    return service;
  }

  getSupportedChains(): ChainType[] {
    return Array.from(this.chainServices.keys());
  }

  async validateAddress(address: string, chainType?: ChainType): Promise<boolean> {
    if (chainType) {
      const service = this.chainServices.get(chainType);
      return service ? service.validateAddress(address) : false;
    }

    // 🎉 Auto-detect chain from address format
    for (const [, service] of this.chainServices) {
      if (service.validateAddress(address)) {
        return true;
      }
    }
    return false;
  }

  private async detectChainType(): Promise<ChainType> {
    const settings = await this.settingsService.getByName('CHAIN_SETTINGS');
    if (!settings?.value?.type) {
      throw new Error('Chain configuration not found in CHAIN_SETTINGS');
    }
    return settings.value.type as ChainType;
  }
}
```

### 6. Simplified Chain Queue Service

```typescript
// src/services/chain-queue.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainType } from '@rahataid/wallet';
import { ChainServiceRegistry, CHAIN_SERVICE_REGISTRY_TOKEN } from './providers/chain-service.registry';
import { AssignTokensDto, DisburseDto, FundAccountDto, SendOtpDto, TransferTokensDto, VerifyOtpDto, AddTriggerDto, UpdateTriggerDto } from './dto/common.dto';

@Injectable()
export class ChainQueueService {
  private readonly logger = new Logger(ChainQueueService.name);

  constructor(
    @Inject(CHAIN_SERVICE_REGISTRY_TOKEN)
    private readonly serviceRegistry: ChainServiceRegistry
  ) {}

  // 🎉 All methods now just delegate to the appropriate service
  async assignTokens(data: AssignTokensDto): Promise<any> {
    this.logger.log('Adding token assignment to queue');
    const service = await this.serviceRegistry.getService();
    return service.assignTokens(data);
  }

  async disburse(data: DisburseDto): Promise<any> {
    this.logger.log('Adding disbursement to queue');
    const service = await this.serviceRegistry.getService();
    return service.disburse(data);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    this.logger.log('Adding OTP send to queue');
    const service = await this.serviceRegistry.getService();
    return service.sendOtp(data);
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    this.logger.log('Adding account funding to queue');
    const service = await this.serviceRegistry.getService();
    return service.fundAccount(data);
  }

  async checkBalance(address: string): Promise<any> {
    this.logger.log(`Checking balance for address: ${address}`);
    const service = await this.serviceRegistry.getService();
    return service.checkBalance(address);
  }

  async addTrigger(data: AddTriggerDto): Promise<any> {
    this.logger.log('Adding trigger to queue');
    const service = await this.serviceRegistry.getService();
    if (!service.addTrigger) {
      throw new Error('Triggers not supported on current chain');
    }
    return service.addTrigger(data);
  }

  // 🎉 Force specific chain operations (when needed)
  async assignTokensOnChain(data: AssignTokensDto, chainType: ChainType): Promise<any> {
    this.logger.log(`Adding token assignment to ${chainType} queue`);
    const service = await this.serviceRegistry.getService(chainType);
    return service.assignTokens(data);
  }

  async disburseOnChain(data: DisburseDto, chainType: ChainType): Promise<any> {
    this.logger.log(`Adding disbursement to ${chainType} queue`);
    const service = await this.serviceRegistry.getService(chainType);
    return service.disburse(data);
  }

  // 🎉 Utility methods
  async validateAddress(address: string, chainType?: ChainType): Promise<boolean> {
    return this.serviceRegistry.validateAddress(address, chainType);
  }

  getSupportedChains(): ChainType[] {
    return this.serviceRegistry.getSupportedChains();
  }

  async getChainType(): Promise<ChainType> {
    const service = await this.serviceRegistry.getService();
    return service.getChainType();
  }

  // All other methods follow the same pattern...
  async transferTokens(data: TransferTokensDto): Promise<any> {
    const service = await this.serviceRegistry.getService();
    return service.transferTokens(data);
  }

  async getDisbursementStatus(id: string): Promise<any> {
    const service = await this.serviceRegistry.getService();
    return service.getDisbursementStatus(id);
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    const service = await this.serviceRegistry.getService();
    return service.verifyOtp(data);
  }

  async updateTrigger(data: UpdateTriggerDto): Promise<any> {
    const service = await this.serviceRegistry.getService();
    if (!service.updateTrigger) {
      throw new Error('Trigger updates not supported on current chain');
    }
    return service.updateTrigger(data);
  }
}
```

### 7. Updated Chain Queue Module

```typescript
// src/services/chain-queue.module.ts
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SettingsModule } from '@rumsan/settings';
import { ChainQueueService } from './chain-queue.service';
import { StellarChainService } from './stellar-chain.service';
import { EvmChainService } from './evm-chain.service';
import { ChainServiceRegistry } from './providers/chain-service.registry';
import { BQUEUE } from '../constants';

@Global()
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: BQUEUE.STELLAR }), BullModule.registerQueue({ name: BQUEUE.CONTRACT }), BullModule.registerQueue({ name: BQUEUE.STELLAR_CHECK_TRUSTLINE })],
  providers: [
    ChainQueueService,
    StellarChainService,
    EvmChainService,
    // 🎉 Same registration pattern as wallet module
    ...ChainServiceRegistry.register({
      services: [StellarChainService, EvmChainService],
    }),
  ],
  exports: [ChainQueueService],
})
export class ChainQueueModule {}
```

## Usage Examples

### 1. Assign Tokens Comparison

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

### 2. Real-World Usage

```typescript
// In any service - beneficiary management
@Injectable()
export class BeneficiaryService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async setupNewBeneficiary(beneficiaryData: any) {
    // 🎉 Fund account
    await this.chainQueueService.fundAccount({
      walletAddress: beneficiaryData.walletAddress,
      amount: 10, // Initial funding
    });

    // 🎉 Assign tokens
    await this.chainQueueService.assignTokens({
      beneficiaryAddress: beneficiaryData.walletAddress,
      amount: 100,
    });

    // 🎉 Check balance
    const balance = await this.chainQueueService.checkBalance(beneficiaryData.walletAddress);

    return { beneficiary: beneficiaryData, balance };
  }

  async processDisbursement(groupId: string, beneficiaries: string[], amounts: number[]) {
    // 🎉 Works for both Stellar and EVM automatically
    return this.chainQueueService.disburse({
      beneficiaries,
      amounts,
      groupId,
    });
  }
}
```

### 3. Chain-Specific Features

```typescript
// Handle chain-specific features gracefully
@Injectable()
export class AdvancedService {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  async setupBeneficiaryWithTriggers(beneficiaryData: AssignTokensDto, triggerData: AddTriggerDto) {
    // 🎉 Assign tokens (works on all chains)
    await this.chainQueueService.assignTokens(beneficiaryData);

    // 🎉 Add trigger (only works on chains that support it)
    try {
      await this.chainQueueService.addTrigger(triggerData);
      this.logger.log('Trigger added successfully');
    } catch (error) {
      this.logger.warn(`Triggers not supported on current chain: ${error.message}`);
      // Continue without triggers
    }
  }

  async sendOtpIfSupported(otpData: SendOtpDto) {
    try {
      return await this.chainQueueService.sendOtp(otpData);
    } catch (error) {
      if (error.message.includes('not supported')) {
        this.logger.warn('OTP not supported on current chain, using alternative method');
        return this.alternativeAuthentication(otpData);
      }
      throw error;
    }
  }
}
```

### 4. Controller Usage

```typescript
// Clean controller methods
@Controller('beneficiaries')
export class BeneficiaryController {
  constructor(private readonly chainQueueService: ChainQueueService) {}

  @Post('assign-tokens')
  async assignTokens(@Body() data: AssignTokensDto) {
    // 🎉 No chain detection, no queue management
    return this.chainQueueService.assignTokens(data);
  }

  @Post('disburse')
  async disburse(@Body() data: DisburseDto) {
    // 🎉 Universal disbursement
    return this.chainQueueService.disburse(data);
  }

  @Get('balance/:address')
  async getBalance(@Param('address') address: string) {
    // 🎉 Works for any valid address format
    return this.chainQueueService.checkBalance(address);
  }

  @Post('validate-address')
  async validateAddress(@Body() { address, chainType }: { address: string; chainType?: ChainType }) {
    // 🎉 Auto-detect or force specific chain
    return this.chainQueueService.validateAddress(address, chainType);
  }
}
```

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

## Benefits

### 1. **Common Interface Benefits** ✨

- **Type Safety**: All chains implement the same interface
- **Consistent API**: Same method signatures across all chains
- **Easy Testing**: Mock the interface, not individual services
- **Enforced Standards**: TypeScript ensures all chains implement required methods
- **IDE Support**: Full autocomplete and IntelliSense

### 2. **Data Consistency** 🎯

- **Common DTOs**: Same data structure for all chains
- **Automatic Transformation**: Each service handles its own data conversion
- **Validation**: Type-safe input validation
- **Documentation**: Clear interface contracts

### 3. **Simplified Development** 🚀

- No need to inject multiple queues or services
- No manual chain detection logic
- Single service for all queue operations
- Universal method signatures

### 4. **Graceful Error Handling** 🛡️

- Clear error messages for unsupported features
- Try/catch patterns for optional features
- Automatic fallback mechanisms

### 5. **Future-Proof Architecture** 🔮

- Easy to add new blockchains by implementing `IChainService`
- Minimal code changes for new chains
- Optional methods handle chain-specific features
- Consistent patterns across all implementations

### 6. **Testing Benefits** 🧪

```typescript
// Mock the interface instead of multiple services
const mockChainService: IChainService = {
  assignTokens: jest.fn().mockResolvedValue({ success: true }),
  disburse: jest.fn().mockResolvedValue({ disbursementId: '123' }),
  validateAddress: jest.fn().mockReturnValue(true),
  getChainType: jest.fn().mockReturnValue('stellar'),
  // ... other methods
};

// Clean, simple test setup
const mockRegistry = {
  getService: jest.fn().mockResolvedValue(mockChainService),
};
```

## Migration Guide

### Step 1: Install the Module

```typescript
// Add to your main module
@Module({
  imports: [
    ChainQueueModule, // 🎉 One import replaces all queue imports
    // ... existing modules
  ],
})
export class AppModule {}
```

### Step 2: Replace Queue Injections

```typescript
// ❌ REMOVE these manual injections
@InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
@InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue,
private settingsService: SettingsService,

// ✅ ADD single service injection
private readonly chainQueueService: ChainQueueService
```

### Step 3: Replace Operations with Common DTOs

```typescript
// ❌ REMOVE manual operations
const chainType = await this.detectChain();
if (chainType === 'stellar') {
  stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarSpecificData);
} else {
  contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmSpecificData);
}

// ✅ ADD unified operations with common DTOs
chainQueueService.assignTokens({
  beneficiaryAddress: 'G...',
  amount: 100,
});
```

### Step 4: Update Data Structures

```typescript
// ❌ REMOVE chain-specific data structures
const stellarData = { walletAddress, secretKey, amount };
const evmData = { size, start, end };

// ✅ ADD common data structure
const commonData: AssignTokensDto = {
  beneficiaryAddress: 'G...',
  amount: 100,
  tokenType: 'RAHAT',
};
```

## Adding New Chains

Adding a new blockchain is super simple - just implement the interface!

```typescript
// Example: Adding Bitcoin support
@Injectable()
export class BitcoinChainService implements IChainService {
  static readonly blockchainType = 'BITCOIN'; // 🎉 Auto-registration

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // 🎉 Bitcoin-specific implementation with automatic data transformation
    const bitcoinData = {
      address: data.beneficiaryAddress,
      satoshis: data.amount * 100000000, // Convert to satoshis
    };
    return this.bitcoinQueue.add('SEND_BITCOIN', bitcoinData);
  }

  async disburse(data: DisburseDto): Promise<any> {
    // 🎉 Bitcoin batch transaction
    return this.bitcoinQueue.add('BATCH_SEND', data);
  }

  validateAddress(address: string): boolean {
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
  }

  getChainType(): ChainType {
    return 'bitcoin';
  }

  // 🎉 Bitcoin doesn't support OTP
  async sendOtp(data: SendOtpDto): Promise<any> {
    throw new Error('OTP not supported on Bitcoin');
  }

  // ... implement all required methods
}

// 🎉 Just add to the module - that's it!
@Module({
  providers: [
    StellarChainService,
    EvmChainService,
    BitcoinChainService, // ← Add here
    ...ChainServiceRegistry.register({
      services: [StellarChainService, EvmChainService, BitcoinChainService], // ← And here
    }),
  ],
})
export class ChainQueueModule {}
```

## Comparison with Current Processors

| Aspect               | Current Processors         | Common Interface Services |
| -------------------- | -------------------------- | ------------------------- |
| **Queue Management** | Manual injection per chain | Automatic routing         |
| **Data Format**      | Chain-specific formats     | Universal DTOs            |
| **Chain Detection**  | Manual in every method     | Automatic                 |
| **Job Names**        | Hard-coded per chain       | Hidden in service         |
| **Error Handling**   | Scattered                  | Centralized               |
| **Testing**          | Mock multiple queues       | Mock single interface     |
| **Adding Chains**    | Update every service       | Implement interface       |
| **Type Safety**      | Weak                       | Strong with DTOs          |
| **Code Lines**       | ~20 per operation          | ~1 per operation          |

## Conclusion

The Chain Queue Registry system with **common interfaces** provides the cleanest, most maintainable solution for multi-chain queue operations. By following the exact same architectural patterns as the successful Wallet system, it ensures:

✅ **Consistency** - Same patterns across the entire codebase  
✅ **Type Safety** - Full TypeScript support with interfaces and DTOs  
✅ **Maintainability** - Easy to understand and modify  
✅ **Extensibility** - Simple to add new blockchains  
✅ **Testability** - Clean mocking and testing patterns  
✅ **Error Handling** - Graceful handling of chain-specific limitations

The **common interface pattern** (`IChainService`) ensures that all blockchain implementations follow the same contract, making the system predictable, testable, and extensible. Each chain service handles its own data transformation internally, keeping the complexity hidden while providing a unified external API.

This approach transforms complex, error-prone, chain-specific code into simple, clean, universal method calls with full type safety and automatic error handling! 🚀

**Usage is as simple as:**

```typescript
// Just inject and use - no worrying about chains, queues, or data formats!
await this.chainQueueService.assignTokens({ beneficiaryAddress: '...', amount: 100 });
```
