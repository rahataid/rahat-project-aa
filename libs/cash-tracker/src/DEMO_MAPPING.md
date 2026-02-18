# Demo Scripts to SDK Mapping

This document shows how the SDK components map to the functionality in the demo scripts.

## 📁 File Structure Mapping

### Demo Scripts → SDK Components

```
scripts/demo/
├── 0.setup-smart-account.ts    → EntityManager.deploySmartAccount()
├── 1.run-account.ts            → OperationsManager.*
└── tracker.ts                  → TrackingManager.*
```

## 🔄 Functionality Mapping

### 1. Smart Account Deployment (`0.setup-smart-account.ts`)

**Demo Script Pattern:**

```typescript
// Load private keys from environment
const privateKeys = process.env.ENTITIES_PK?.split(",") || [];

// Deploy smart accounts
for (let i = 0; i < privateKeys.length; i++) {
  const wallet = new ethers.Wallet(privateKey, provider);
  const SmartAccount = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );
  const smartAccount = await SmartAccount.deploy(entryPointAddress);
  // Save to entities array
}
```

**SDK Implementation:**

```typescript
// EntityManager.deploySmartAccounts()
const entities = await sdk.deploySmartAccounts(privateKeys);
```

**Key Components:**

- `EntityManager.deploySmartAccount()` - Deploys individual smart accounts
- `EntityManager.deployMultiple()` - Deploys multiple smart accounts
- `EntityManager.loadFromConfig()` - Loads existing entities

### 2. Interactive Operations (`1.run-account.ts`)

**Demo Script Pattern:**

```typescript
// Menu operations
const OPERATIONS = {
  CHECK_BALANCE: "Check CashToken balance",
  APPROVE_TOKENS: "Approve tokens",
  CHECK_ALLOWANCE: "Check allowance",
  TRANSFER_FROM: "Transfer approved tokens (transferFrom)",
  SWITCH_ACCOUNT: "Switch Account",
  EXIT: "Exit",
};

// Execute operations through smart account
const approveTx = await activeAccount.smartAccount.execute(
  cashTokenAddress,
  0,
  cashToken.interface.encodeFunctionData("approve", [spender, approveAmount])
);
```

**SDK Implementation:**

```typescript
// OperationsManager methods
await sdk.getBalance(entityId);
await sdk.approveTokens(ownerId, spenderId, amount);
await sdk.getAllowance(ownerId, spenderId);
await sdk.transferFrom(spenderId, fromId, toId, amount);
await sdk.switchEntity(entityId);
```

**Key Components:**

- `OperationsManager.getBalance()` - Check token balances
- `OperationsManager.approveTokens()` - Approve token spending
- `OperationsManager.getAllowance()` - Check allowances
- `OperationsManager.transferFrom()` - Transfer tokens using allowances
- `OperationsManager.estimateGas()` - Gas estimation

### 3. Real-time Tracking (`tracker.ts`)

**Demo Script Pattern:**

```typescript
// Track balances
async function trackBalances() {
  for (const entity of entities.entities) {
    const balance = await cashToken.balanceOf(entity.smartAccount);
    console.log(`${entity.smartAccount}: ${ethers.formatEther(balance)} CASH`);
  }
}

// Track allowances
async function trackAllowances() {
  for (const owner of entities.entities) {
    for (const spender of entities.entities) {
      const allowance = await cashToken.allowance(
        owner.smartAccount,
        spender.smartAccount
      );
      if (allowance > 0n) {
        console.log(
          `  → To ${spender.smartAccount}: ${ethers.formatEther(
            allowance
          )} CASH`
        );
      }
    }
  }
}

// Auto-refresh loop
while (isTracking) {
  await displayStatus();
  await new Promise((resolve) => setTimeout(resolve, refreshInterval * 1000));
}
```

**SDK Implementation:**

```typescript
// TrackingManager methods
const session = await sdk.startTracking({
  interval: 5000,
  entities: ["entity1", "entity2"],
  includeBalances: true,
  includeAllowances: true,
  onUpdate: (state) => {
    console.log("Balances:", state.balances);
    console.log("Allowances:", state.allowances);
  },
});
```

**Key Components:**

- `TrackingManager.startTracking()` - Start real-time monitoring
- `TrackingManager.trackBalances()` - Track token balances
- `TrackingManager.trackAllowances()` - Track token allowances
- `TrackingManager.displayStatus()` - Display current state
- `TrackingSession` - Manage tracking sessions

## 🏗️ Architecture Comparison

### Demo Scripts (Procedural)

```
1. Load configuration
2. Deploy smart accounts
3. Interactive menu loop
4. Real-time tracking loop
```

### SDK (Object-Oriented)

```
CashTokenSDK
├── EntityManager (Smart Account lifecycle)
├── OperationsManager (Token operations)
├── TrackingManager (Real-time monitoring)
├── EventManager (Event system)
└── ConfigManager (Configuration)
```

## 🎯 Key Improvements in SDK

### 1. **Modularity**

- **Demo**: Monolithic scripts
- **SDK**: Separated concerns into managers

### 2. **Error Handling**

- **Demo**: Basic try-catch
- **SDK**: Custom `SDKError` with error codes

### 3. **Type Safety**

- **Demo**: Minimal typing
- **SDK**: Comprehensive TypeScript interfaces

### 4. **Event System**

- **Demo**: Direct console logging
- **SDK**: Event-driven architecture with subscriptions

### 5. **Configuration**

- **Demo**: Hardcoded values
- **SDK**: Flexible configuration management

### 6. **Validation**

- **Demo**: Basic checks
- **SDK**: Comprehensive validation utilities

## 📋 Usage Examples

### Demo Script Style

```typescript
// 0.setup-smart-account.ts
const privateKeys = process.env.ENTITIES_PK?.split(",") || [];
for (const privateKey of privateKeys) {
  // Deploy smart account
}

// 1.run-account.ts
while (true) {
  const operation = await selectOperation();
  switch (operation) {
    case "approve":
      // Execute approval
      break;
  }
}

// tracker.ts
while (isTracking) {
  await displayStatus();
  await sleep(refreshInterval);
}
```

### SDK Style

```typescript
// Initialize SDK
const sdk = new CashTokenSDK(config);
await sdk.initialize();

// Deploy smart accounts
const entities = await sdk.deploySmartAccounts(privateKeys);

// Operations
await sdk.approveTokens("entity1", "entity2", amount);
const balance = await sdk.getBalance("entity1");

// Real-time tracking
const session = await sdk.startTracking({
  interval: 5000,
  onUpdate: (state) => console.log(state),
});

// Event handling
sdk.on("balance_changed", (event) => {
  console.log("Balance updated:", event);
});
```

## 🔧 Migration Path

### From Demo Scripts to SDK

1. **Replace direct ethers usage** → Use SDK managers
2. **Replace console.log** → Use event system
3. **Replace hardcoded values** → Use configuration
4. **Replace basic error handling** → Use SDKError
5. **Replace procedural code** → Use object-oriented approach

### Benefits

- ✅ Type safety
- ✅ Error handling
- ✅ Event system
- ✅ Modularity
- ✅ Reusability
- ✅ Testability
- ✅ Configuration flexibility
