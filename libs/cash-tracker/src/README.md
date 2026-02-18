# Cash Tracker SDK

A TypeScript SDK for managing cash tokens and smart accounts on blockchain networks. Each SDK instance represents a single entity with its own smart account.

## Features

- **Entity-Based Design**: Each SDK instance represents one entity with its own smart account
- **Simplified Configuration**: Easy setup with network and contract configuration
- **Cash Token Operations**: Approve, transfer, and check balances with intuitive methods
- **Smart Account Integration**: Execute operations through smart accounts for enhanced security
- **Real-time Tracking**: Monitor balances and allowances in real-time
- **Flow Tracking**: Track token flow between multiple smart addresses
- **Event System**: Subscribe to balance and allowance changes
- **Automatic Balance Checking**: SDK automatically checks balances before approvals
- **Flexible Amount Handling**: Support for string, number, or bigint amounts
- **Three Initialization Modes**: Support for defaultPrivatekey, connect(), and entities array

## Installation

```bash
npm install @rumsan/cash-tracker-sdk
```

## Quick Start

### 1. Configuration Setup

Create a configuration file `config/entities.json`:

```json
{
  "network": "https://sepolia.base.org",
  "entryPoint": "0x1e2717BC0dcE0a6632fe1B057e948ec3EF50E38b",
  "entities": [
    {
      "privateKey": "your_private_key_here",
      "address": "0x...",
      "smartAccount": "0x..."
    },
    {
      "privateKey": "another_private_key_here",
      "address": "0x...",
      "smartAccount": "0x..."
    }
  ]
}
```

### 2. Three Initialization Modes

The SDK supports three different initialization modes:

#### Mode 1: With defaultPrivatekey (Single Entity Operations)

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

const entity1 = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
    entitySmartAccount: entities[0].smartAccount,
    defaultPrivatekey: entities[0].privateKey,
  },
});

await entity1.initialize();
console.log(`Address: ${entity1.address}`);
console.log(`Smart Account: ${entity1.smartAccount}`);
```

#### Mode 2: With connect() (Wallet Connection)

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

const entity2 = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
    entitySmartAccount: entities[1].smartAccount,
  },
});

await entity2.initialize();
entity2.connect(entities[1].privateKey);
console.log(`Address: ${entity2.address}`);
```

#### Mode 3: With entities (Smart Addresses Array for Flow Tracking)

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

const smartAddresses = entities.map((entity) => entity.smartAccount);

const flowTracker = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
  },
  entities: smartAddresses,
});

await flowTracker.initialize();

// Start flow tracking
await flowTracker.startFlowTracking(smartAddresses, {
  interval: 5000, // Update every 5 seconds
  onFlowUpdate: (flowData) => {
    console.log("Flow update detected!");
    console.log(`Balances: ${flowData.balances.length}`);
    console.log(`Flows: ${flowData.flows.length}`);
  },
});
```

### 3. Basic Operations

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

// Initialize SDK for Entity 1
const entity1 = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
    entitySmartAccount: entities[0].smartAccount,
    defaultPrivatekey: entities[0].privateKey,
  },
});

// Initialize the SDK
await entity1.initialize();

// Check balance
const balance = await entity1.getCashBalance();
console.log(`Balance: ${balance.formatted} ${balance.symbol}`);

// Give allowance to another address (SDK handles parsing internally)
const result = await entity1.giveCashAllowance(otherAddress, "100"); // 100 tokens
console.log(`Allowance transaction: ${result.hash}`);

// Transfer cash from another address (using allowance)
const transferResult = await entity1.getCashFrom(otherAddress, "50"); // 50 tokens
console.log(`Transfer transaction: ${transferResult.hash}`);

// Check allowances
const approvedToMe = await entity1.getCashApprovedToMe(ownerAddress);
const approvedByMe = await entity1.getCashApprovedByMe(spenderAddress);
```

## Flow Tracking

The SDK provides powerful flow tracking capabilities to monitor token movements between smart addresses:

### Start Flow Tracking

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

const smartAddresses = ["0x1234...", "0x5678...", "0x9abc..."];

const flowTracker = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
  },
  entities: smartAddresses,
});

await flowTracker.initialize();

// Start flow tracking
await flowTracker.startFlowTracking(smartAddresses, {
  interval: 3000, // Update every 3 seconds
  onFlowUpdate: (flowData) => {
    console.log("🔄 Flow Update Detected!");

    // Display recent flows
    for (const flow of flowData.flows) {
      const direction = flow.type === "balance_change" ? "↔" : "→";
      console.log(
        `${flow.from} ${direction} ${flow.to}: ${flow.formatted} CASH`
      );
    }

    // Display current balances
    for (const balance of flowData.balances) {
      console.log(
        `${balance.entityId}: ${balance.formatted} ${balance.symbol}`
      );
    }
  },
});
```

### Flow History Tracking

The SDK automatically tracks complete flow paths (A->B->C) and provides comprehensive history:

```typescript
// Get complete flow history
const histories = flowTracker.getFlowHistory();

// Get active flows
const activeFlows = flowTracker.getActiveFlows();

// Get flow history by specific path
const pathFlows = flowTracker.getFlowHistoryByPath([
  "0x1234...",
  "0x5678...",
  "0x9abc...",
]);

// Get flow history for specific address
const addressFlows = flowTracker.getFlowHistoryByAddress("0x5678...");

// Display flow history
flowTracker.displayFlowHistory();

// Display active flows
flowTracker.displayActiveFlows();

// Set flow history options
flowTracker.setFlowHistoryOptions({
  maxHistory: 100,
  includeBlockNumbers: true,
  includeDescriptions: true,
});
```

### Business Logic Flow Example (A->B->C)

```typescript
// Initialize flow tracker for A->B->C path
const smartAddresses = ["0xEntityA", "0xEntityB", "0xEntityC"];
const flowTracker = new CashTokenSDK({
  network: { rpcUrl: "...", entryPoint: "..." },
  contracts: { cashToken: "...", cashtokenAbi: "..." },
  entities: smartAddresses,
});

await flowTracker.initialize();

// Start tracking A->B->C flows
await flowTracker.startFlowTracking(smartAddresses, {
  interval: 2000,
  onFlowUpdate: (flowData) => {
    console.log("Flow detected:", flowData.flows.length, "new flows");
  },
});

// The SDK will automatically detect and track:
// 1. A gives allowance to B
// 2. B gives allowance to C
// 3. C gets cash from B
// 4. B gets cash from A
// 5. Complete A->B->C flow path

// Later, get the complete flow history
const histories = flowTracker.getFlowHistory();
for (const history of histories) {
  console.log(`Flow: ${history.path.join("->")}`);
  console.log(`Status: ${history.status}`);
  console.log(`Amount: ${history.formattedTotalAmount} CASH`);
  console.log(`Steps: ${history.entries.length}`);
}
```

### Flow Data Structure

```typescript
interface TokenFlowData {
  timestamp: number;
  flows: TokenFlow[];
  balances: TokenBalance[];
  allowances: TokenAllowance[];
}

interface TokenFlow {
  from: string;
  to: string;
  amount: bigint;
  formatted: string;
  transactionHash?: string;
  timestamp: number;
  type: "transfer" | "allowance" | "balance_change";
}
```

### Flow Tracking Methods

```typescript
import { CashTokenSDK } from "@rumsan/cash-tracker-sdk";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Load config from config/entities.json
const loadConfig = () => {
  const configPath = path.join(__dirname, "config/entities.json");
  const configData = fs.readFileSync(configPath, "utf8");
  return JSON.parse(configData);
};

const config = loadConfig();
const entities = config.entities;

const smartAddresses = ["0x1234...", "0x5678...", "0x9abc..."];

const flowTracker = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    smartAccountFactory: process.env.SMART_ACCOUNT_FACTORY!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
  },
  entities: smartAddresses,
});

await flowTracker.initialize();

// Start flow tracking
await flowTracker.startFlowTracking(smartAddresses, options);

// Stop flow tracking
await flowTracker.stopFlowTracking();

// Get current flow data
const flowData = await flowTracker.getFlowData();

// Display flow status
await flowTracker.displayFlowStatus();

// Check if flow tracking is active
const isTracking = flowTracker.isFlowTracking();

// Get tracked addresses
const addresses = flowTracker.getTrackedAddresses();
```

## Configuration

### SDKConfig Interface

```typescript
interface SDKConfig {
  network: {
    rpcUrl: string;
    chainId?: number;
    entryPoint: string;
  };
  contracts: {
    cashToken: string;
    smartAccountFactory?: string;
    cashtokenAbi?: any;
    entitySmartAccount?: string;
    defaultPrivatekey?: string;
  };
  entities?: string[]; // Array of smart addresses for flow tracking
  flowTracking?: FlowTrackingConfig;
}

interface FlowTrackingConfig {
  smartAddresses: string[];
  interval?: number;
  onFlowUpdate?: (flowData: TokenFlowData) => void;
}
```

### Environment Variables

```bash
# Contract Addresses
CASH_TOKEN=0xc3E3282048cB2F67b8e08447e95c37f181E00133
SMART_ACCOUNT_FACTORY=0x...
```

### Artifacts

The SDK automatically loads ABIs from the `src/artifacts/` directory:

- `src/artifacts/CashTokenAbi.json` - CashToken contract ABI
- `src/artifacts/SmartAccountAbi.json` - SmartAccount contract ABI
- `src/artifacts/SmartAccountFactoryAbi.json` - SmartAccountFactory contract ABI

## API Reference

### Core Methods

#### `initialize(config?: SDKConfig): Promise<void>`

Initialize the SDK with configuration.

#### `connect(walletOrPrivateKey: ethers.Wallet | string): void`

Connect a wallet to the SDK instance.

#### `getCashBalance(): Promise<TokenBalance>`

Get the current cash balance of the entity.

#### `giveCashAllowance(spenderAddress: string, amount: string | number | bigint): Promise<TransactionResult>`

Give cash allowance to another address. The SDK automatically:

- Checks if you have sufficient balance for approval
- Handles amount parsing (string, number, or bigint)
- Provides detailed error messages for insufficient balance

#### `getCashFrom(fromAddress: string, amount?: string | number | bigint): Promise<TransactionResult>`

Transfer cash from another address using allowance. The SDK automatically:

- Checks if there's sufficient allowance
- Handles amount parsing (string, number, or bigint)
- Uses full allowance if amount not specified
- Provides detailed error messages for insufficient allowance

#### `getCashApprovedToMe(ownerAddress: string): Promise<TokenAllowance>`

Get cash allowance approved to me by another address.

#### `getCashApprovedByMe(spenderAddress: string): Promise<TokenAllowance>`

Get cash allowance I approved to another address.

### Utility Methods

#### `getProvider(): ethers.Provider | null`

Get the current provider instance.

#### `getCashTokenContract(): ethers.Contract | null`

Get the CashToken contract instance.

#### `get address(): string | null`

Get the current entity address.

#### `get smartAccount(): string | null`

Get the current smart account address.

## Examples

### Multi-Entity Cash Transfer

```typescript
// Load configuration
const config = loadConfig();
const entities = config.entities;

// Initialize two entities
const companyA = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
    entitySmartAccount: entities[0].smartAccount,
    defaultPrivatekey: entities[0].privateKey,
  },
});

const companyB = new CashTokenSDK({
  network: {
    rpcUrl: config.network,
    entryPoint: config.entryPoint,
  },
  contracts: {
    cashToken: process.env.CASH_TOKEN!,
    cashtokenAbi: require("./src/artifacts/CashTokenAbi.json"),
    entitySmartAccount: entities[1].smartAccount,
    defaultPrivatekey: entities[1].privateKey,
  },
});

await companyA.initialize();
await companyB.initialize();

// Company A gives allowance to Company B (SDK handles parsing)
await companyA.giveCashAllowance(companyB.address!, "1000");

// Company A transfers cash from Company B (SDK handles parsing)
await companyA.getCashFrom(companyB.address!, "500");

// Check final balances
const finalBalanceA = await companyA.getCashBalance();
const finalBalanceB = await companyB.getCashBalance();
```

### Amount Handling Examples

```typescript
// All these work the same way - SDK handles parsing internally
await entity.giveCashAllowance(spenderAddress, "100"); // String
await entity.giveCashAllowance(spenderAddress, 100); // Number
await entity.giveCashAllowance(spenderAddress, 100n); // BigInt

await entity.getCashFrom(fromAddress, "50"); // String
await entity.getCashFrom(fromAddress, 50); // Number
await entity.getCashFrom(fromAddress, 50n); // BigInt
await entity.getCashFrom(fromAddress); // Use full allowance
```

### Real-time Tracking

```typescript
// Subscribe to balance changes
entity1.on("balance_changed", (event) => {
  console.log(`Balance changed: ${event.formatted.new}`);
});

// Subscribe to allowance changes
entity1.on("allowance_changed", (event) => {
  console.log(`Allowance changed: ${event.formatted.new}`);
});
```

## Error Handling

The SDK uses a custom error system with specific error codes:

```typescript
import { SDKError, SDKErrorCode } from "@rumsan/cash-tracker-sdk";

try {
  await entity1.giveCashAllowance(address, "1000");
} catch (error) {
  if (error instanceof SDKError) {
    switch (error.code) {
      case SDKErrorCode.INVALID_CONFIG:
        console.log("Configuration error:", error.message);
        break;
      case SDKErrorCode.TRANSACTION_FAILED:
        console.log("Transaction failed:", error.message);
        break;
      case SDKErrorCode.NETWORK_ERROR:
        console.log("Network error:", error.message);
        break;
      case SDKErrorCode.VALIDATION_ERROR:
        console.log("Validation error:", error.message);
        // This includes insufficient balance/allowance errors
        break;
    }
  }
}
```

## Types

### TokenBalance

```typescript
interface TokenBalance {
  entityId: string;
  balance: bigint;
  formatted: string;
  decimals: number;
  symbol: string;
}
```

### TokenAllowance

```typescript
interface TokenAllowance {
  ownerId: string;
  spenderId: string;
  allowance: bigint;
  formatted: string;
}
```

### TransactionResult

```typescript
interface TransactionResult {
  hash: string;
  status: "pending" | "confirmed" | "failed";
  receipt?: any;
  error?: string;
  gasUsed?: bigint;
  gasPrice?: bigint;
}
```

## Development

### Running Examples

```bash
# Basic usage
npm run example:basic

# Complete demo flow
npm run example:complete
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

MIT License - see LICENSE file for details.
