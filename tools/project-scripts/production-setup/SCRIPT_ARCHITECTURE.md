# Script Architecture Pattern Recommendations

## 🎯 Current Issues

### Problem: Monolithic Scripts

Current `_setup-deployment.ts` does **too many things**:

1. ✅ Deploys 5 contracts (TriggerManager, RahatDonor, RahatToken, AAProject, CashToken)
2. ✅ Sets contract permissions (3 different permission calls)
3. ✅ Writes to deployment file
4. ✅ Updates database (CONTRACT, BLOCKCHAIN, CHAIN_SETTINGS)
5. ❌ No way to resume from failure
6. ❌ No way to run individual steps
7. ❌ No state tracking
8. ❌ Hard to test individual operations

---

## 🏗️ Recommended Pattern: Command + Pipeline Architecture

### **Pattern Overview**

```
┌─────────────────────────────────────────────────────────┐
│ Orchestrator (setup.sh / deploy-pipeline.ts)            │
│ - Manages execution flow                                 │
│ - Handles state tracking                                 │
│ - Manages rollback                                       │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ Commands (Individual Scripts)                           │
│ - deploy-contracts.ts                                    │
│ - configure-permissions.ts                               │
│ - save-deployment-state.ts                              │
│ - update-database.ts                                     │
│ - verify-deployment.ts                                   │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ Services (Shared Utilities)                             │
│ - _common.ts (ContractLib)                               │
│ - _state-manager.ts                                      │
│ - _logger.ts                                             │
│ - _secrets-manager.ts                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Recommended File Structure

```
production-setup/
├── commands/                    # Individual command scripts
│   ├── deploy-contracts.ts     # Deploy all contracts
│   ├── deploy-single-contract.ts # Deploy one contract (reusable)
│   ├── configure-permissions.ts # Set contract permissions
│   ├── save-deployment-state.ts # Save to deployment file
│   ├── update-database.ts      # Update database settings
│   ├── verify-deployment.ts    # Post-deployment verification
│   └── rollback-deployment.ts  # Rollback capability
│
├── services/                    # Shared services
│   ├── _common.ts              # ContractLib (existing)
│   ├── _state-manager.ts       # Track deployment state
│   ├── _logger.ts              # Structured logging
│   ├── _secrets-manager.ts     # Secure secrets handling
│   └── _deployment-store.ts    # Deployment file operations
│
├── pipelines/                   # Orchestration scripts
│   ├── deploy-pipeline.ts      # Main deployment pipeline
│   └── rollback-pipeline.ts    # Rollback pipeline
│
├── utils/                       # Utility functions
│   ├── validation.ts           # Validation helpers
│   ├── error-handler.ts        # Error handling
│   └── retry.ts                # Retry mechanisms
│
├── setup.sh                    # Shell orchestrator (existing)
├── validate-env.ts             # Pre-flight validation (existing)
└── _common.ts                  # Legacy (move to services/)
```

---

## 🎨 Pattern 1: Command Pattern

### **Principle**: Each script does ONE thing well

### **Example Structure**:

```typescript
// commands/deploy-single-contract.ts
export interface DeployContractCommand {
  contractName: string;
  constructorArgs: any[];
  deployerKey: string;
  projectUUID: string;
}

export async function deployContract(command: DeployContractCommand): Promise<DeployedContract> {
  // Single responsibility: Deploy ONE contract
  // Returns: contract address and block number
}

// commands/deploy-contracts.ts
export async function deployAllContracts(projectUUID: string): Promise<Record<string, DeployedContract>> {
  // Orchestrates multiple contract deployments
  // Uses deploy-single-contract for each
}
```

### **Benefits**:

- ✅ Can test individual contract deployment
- ✅ Can deploy contracts independently
- ✅ Can resume from specific contract
- ✅ Clear error boundaries

---

## 🎨 Pattern 2: Pipeline Pattern

### **Principle**: Sequential execution with state tracking

### **Example Structure**:

```typescript
// pipelines/deploy-pipeline.ts
interface PipelineStep {
  name: string;
  command: () => Promise<void>;
  rollback?: () => Promise<void>;
  checkpoint: boolean; // Can resume from here
}

const deploymentPipeline: PipelineStep[] = [
  {
    name: 'validate-environment',
    command: () => validateEnvironment(),
    checkpoint: true,
  },
  {
    name: 'deploy-trigger-manager',
    command: () => deployContract({ name: 'TriggerManager', args: [2] }),
    rollback: () => rollbackContract('TriggerManager'),
    checkpoint: true,
  },
  {
    name: 'deploy-rahat-donor',
    command: () => deployContract({ name: 'RahatDonor', args: [...] }),
    rollback: () => rollbackContract('RahatDonor'),
    checkpoint: true,
  },
  // ... more steps
  {
    name: 'configure-permissions',
    command: () => configurePermissions(),
    checkpoint: true,
  },
  {
    name: 'save-deployment-state',
    command: () => saveDeploymentState(),
    checkpoint: true,
  },
  {
    name: 'update-database',
    command: () => updateDatabase(),
    checkpoint: true,
  },
];

async function runPipeline(pipeline: PipelineStep[], resumeFrom?: string) {
  const stateManager = new StateManager();
  const startIndex = resumeFrom
    ? pipeline.findIndex(s => s.name === resumeFrom)
    : 0;

  for (let i = startIndex; i < pipeline.length; i++) {
    const step = pipeline[i];
    try {
      await step.command();
      await stateManager.markStepComplete(step.name);

      if (step.checkpoint) {
        await stateManager.saveCheckpoint(step.name);
      }
    } catch (error) {
      // Rollback previous steps
      await rollbackSteps(pipeline, i);
      throw error;
    }
  }
}
```

### **Benefits**:

- ✅ Can resume from any checkpoint
- ✅ Automatic rollback on failure
- ✅ State tracking
- ✅ Progress visibility

---

## 🎨 Pattern 3: State Management

### **Principle**: Track what's been done, can resume

### **Example Structure**:

```typescript
// services/_state-manager.ts
interface DeploymentState {
  projectUUID: string;
  startedAt: string;
  lastCheckpoint: string;
  completedSteps: string[];
  failedSteps: string[];
  deployedContracts: Record<string, { address: string; blockNumber: number }>;
  status: 'in-progress' | 'completed' | 'failed' | 'rolled-back';
}

class StateManager {
  async saveCheckpoint(stepName: string): Promise<void> {
    // Save state to file/database
  }

  async loadState(): Promise<DeploymentState | null> {
    // Load previous state
  }

  async markStepComplete(stepName: string): Promise<void> {
    // Mark step as complete
  }

  async getResumePoint(): Promise<string | null> {
    // Get last checkpoint to resume from
  }
}
```

### **Benefits**:

- ✅ Can resume from failure
- ✅ Track deployment history
- ✅ Audit trail
- ✅ Debugging capability

---

## 🎨 Pattern 4: Modular Service Layer

### **Principle**: Shared utilities in services, not duplicated

### **Example Structure**:

```typescript
// services/_logger.ts
export class Logger {
  static info(message: string, data?: any): void {
    // Structured logging
  }

  static error(message: string, error: Error): void {
    // Error logging with stack traces
  }

  static deployment(action: string, data: any): void {
    // Deployment-specific logging
  }
}

// services/_secrets-manager.ts
export class SecretsManager {
  static getPrivateKey(): string {
    // Get from secrets manager, NOT from file
    // Never log
    return process.env.DEPLOYER_PRIVATE_KEY || (await this.getFromSecretsManager('DEPLOYER_PRIVATE_KEY'));
  }

  static async getFromSecretsManager(key: string): Promise<string> {
    // AWS Secrets Manager / HashiCorp Vault / etc.
  }
}

// services/_deployment-store.ts
export class DeploymentStore {
  async save(deployment: DeploymentState): Promise<void> {
    // Save to deployment file
  }

  async load(projectUUID: string): Promise<DeploymentState | null> {
    // Load from deployment file
  }

  async backup(projectUUID: string): Promise<string> {
    // Backup existing deployment before changes
  }
}
```

---

## 🎯 Recommended Refactoring

### **Step 1: Extract Commands**

**Current**: `_setup-deployment.ts` (248 lines, does everything)

**Refactor to**:

```typescript
// commands/deploy-contracts.ts
export async function deployAllContracts(projectUUID: string) {
  const contracts = [
    { name: 'TriggerManager', args: [2] },
    { name: 'RahatDonor', args: [...] },
    // ...
  ];

  const deployed = {};
  for (const contract of contracts) {
    deployed[contract.name] = await deploySingleContract(contract);
  }

  return deployed;
}

// commands/configure-permissions.ts
export async function configurePermissions(deployedContracts: any) {
  // Set all permissions
}

// commands/save-deployment-state.ts
export async function saveDeploymentState(projectUUID: string, contracts: any) {
  // Save to file
}
```

### **Step 2: Create Pipeline**

```typescript
// pipelines/deploy-pipeline.ts
export async function runDeploymentPipeline(projectUUID: string) {
  const pipeline = [
    { name: 'validate', command: validateEnvironment },
    { name: 'deploy-contracts', command: () => deployAllContracts(projectUUID) },
    { name: 'configure-permissions', command: () => configurePermissions(...) },
    { name: 'save-state', command: () => saveDeploymentState(...) },
    { name: 'update-database', command: () => updateDatabase(...) },
  ];

  return await executePipeline(pipeline);
}
```

### **Step 3: Update Orchestrator**

```bash
# setup.sh
#!/bin/sh
SCRIPT_DIR=$(dirname "$0")

# Run pipeline
npx ts-node "$SCRIPT_DIR/pipelines/deploy-pipeline.ts" "$@"
```

---

## ✅ Benefits of This Pattern

### **1. Single Responsibility**

- Each script does ONE thing
- Easy to understand
- Easy to test

### **2. Reusability**

- `deploy-single-contract.ts` can be used for any contract
- Commands can be composed
- Services can be shared

### **3. Testability**

- Can test individual commands
- Can mock services
- Can test pipeline logic separately

### **4. Resumability**

- Can resume from checkpoints
- Can skip completed steps
- Can retry failed steps

### **5. Debuggability**

- Clear error boundaries
- Step-by-step execution
- State tracking

### **6. Maintainability**

- Easy to add new steps
- Easy to modify existing steps
- Clear dependencies

---

## 🚀 Implementation Priority

### **Phase 1: Extract Commands** (High Priority)

1. Create `commands/` directory
2. Extract contract deployment to `deploy-contracts.ts`
3. Extract permission configuration to `configure-permissions.ts`
4. Extract database update to `update-database.ts`

### **Phase 2: Add State Management** (High Priority)

1. Create `services/_state-manager.ts`
2. Add checkpoint tracking
3. Add resume capability

### **Phase 3: Create Pipeline** (Medium Priority)

1. Create `pipelines/deploy-pipeline.ts`
2. Implement checkpoint system
3. Add rollback capability

### **Phase 4: Enhance Services** (Medium Priority)

1. Create `services/_logger.ts`
2. Create `services/_secrets-manager.ts`
3. Create `services/_deployment-store.ts`

### **Phase 5: Add Utilities** (Low Priority)

1. Create `utils/validation.ts`
2. Create `utils/error-handler.ts`
3. Create `utils/retry.ts`

---

## 📝 Example Usage

### **Before (Current)**:

```bash
./setup.sh  # Runs everything, fails at step 5, have to start over
```

### **After (Proposed)**:

```bash
# Full deployment
./setup.sh

# Resume from failure
./setup.sh --resume-from configure-permissions

# Run specific step
./setup.sh --step deploy-contracts

# Dry run (validate only)
./setup.sh --dry-run

# Rollback
./setup.sh --rollback
```

---

## 🎯 Summary

**Current Pattern**: Monolithic scripts doing everything

**Recommended Pattern**: Command + Pipeline + State Management

**Key Principles**:

1. ✅ **Single Responsibility** - One script, one job
2. ✅ **Modularity** - Reusable commands and services
3. ✅ **State Tracking** - Know what's been done
4. ✅ **Resumability** - Can resume from failures
5. ✅ **Testability** - Easy to test individual parts
6. ✅ **Maintainability** - Easy to modify and extend
