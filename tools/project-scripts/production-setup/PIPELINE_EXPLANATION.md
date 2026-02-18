# Deployment Pipeline: How It Works

## 🎯 What Does the Pipeline Do?

The **Deployment Pipeline** is an orchestrator that manages the **sequential execution** of deployment steps with:

- ✅ **State tracking** - Remembers what's been done
- ✅ **Resumability** - Can resume from failures
- ✅ **Checkpointing** - Saves progress at key points
- ✅ **Error handling** - Distinguishes critical vs optional steps
- ✅ **Idempotency** - Skips already completed steps

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    setup.sh                             │
│  (Main orchestrator - calls pipeline)                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│            DeploymentPipeline                          │
│  - Manages step execution                              │
│  - Tracks state                                        │
│  - Handles errors                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              StateManager                               │
│  - Saves progress to .state/{projectUUID}.json         │
│  - Tracks completed/failed steps                        │
│  - Manages checkpoints                                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│            Individual Commands                         │
│  - deploy-contracts.ts                                 │
│  - configure-permissions.ts                            │
│  - save-deployment-state.ts                            │
└─────────────────────────────────────────────────────────┘
```

## 📋 Pipeline Steps

The pipeline executes these steps **in order**:

### 1. **deploy-contracts** 🔴 REQUIRED

- Deploys all 5 contracts (TriggerManager, RahatDonor, RahatToken, AAProject, CashToken)
- Stores contract addresses and block numbers
- **Checkpoint**: ✅ Yes (can resume from here)
- **Required**: ✅ Yes (cannot skip)

### 2. **configure-permissions** 🔴 REQUIRED

- Grants roles to contracts
- Registers project in RahatDonor
- **Checkpoint**: ✅ Yes
- **Required**: ✅ Yes (registerProject is critical)

### 3. **save-deployment-state** 🔴 REQUIRED

- Saves deployment data to `deployments/{projectUUID}.json`
- Needed for graph and database updates
- **Checkpoint**: ✅ Yes
- **Required**: ✅ Yes

## 🔄 How It Works: Step-by-Step

### **Phase 1: Initialization**

```typescript
// 1. Create pipeline instance
const pipeline = new DeploymentPipeline(projectUUID);

// 2. Load or initialize state
let state = await stateManager.load();
if (!state) {
  state = await stateManager.initialize(projectUUID);
}
// State file: .state/{projectUUID}.json
```

**State Structure**:

```json
{
  "projectUUID": "30d1a534-...",
  "startedAt": "2025-11-06T15:22:00.000Z",
  "lastCheckpoint": "deploy-contracts",
  "completedSteps": ["deploy-contracts"],
  "failedSteps": [],
  "deployedContracts": {
    "TriggerManager": { "address": "0x...", "blockNumber": 12345 }
  },
  "status": "in-progress",
  "metadata": {
    "deploy-contracts": { "result": {...} }
  }
}
```

### **Phase 2: Resume Detection**

```typescript
// Check if resuming from a specific step
if (resumeFrom) {
  startIndex = findStepIndex(resumeFrom);
} else {
  // Auto-resume from last checkpoint
  const lastCheckpoint = await stateManager.getResumePoint();
  if (lastCheckpoint) {
    startIndex = findStepIndex(lastCheckpoint);
  }
}
```

**Example**: If pipeline failed at step 2, it will resume from `configure-permissions` instead of starting over.

### **Phase 3: Step Execution Loop**

```typescript
for (let i = startIndex; i < pipeline.length; i++) {
  const step = pipeline[i];

  // 1. Check if already completed
  if (isCompleted && !resumeFrom) {
    Logger.info('Step already completed, skipping...');
    continue; // Skip to next step
  }

  // 2. Execute step
  try {
    await step.command();

    // 3. Save checkpoint if configured
    if (step.checkpoint) {
      await stateManager.saveCheckpoint(step.name);
    }

    Logger.success('Step completed');
  } catch (error) {
    // 4. Handle error based on step type
    if (step.required) {
      // CRITICAL: Stop pipeline
      throw error;
    } else {
      // OPTIONAL: Continue with warning
      markStepSkipped(step.name);
    }
  }
}
```

### **Phase 4: Completion**

```typescript
// Mark deployment as completed
await stateManager.markCompleted();
Logger.success('Deployment pipeline completed successfully');
```

## 🔍 Key Features Explained

### **1. State Persistence**

**Where**: `.state/{projectUUID}.json`

**What it tracks**:

- ✅ Completed steps
- ✅ Failed steps
- ✅ Last checkpoint
- ✅ Deployed contracts
- ✅ Step metadata (results, errors)

**Why**: Enables resumability and prevents duplicate work.

### **2. Checkpointing**

**What**: Saves progress at key points

**When**: After each step marked with `checkpoint: true`

**Why**: Can resume from last successful checkpoint if pipeline fails

**Example**:

```typescript
{
  name: 'deploy-contracts',
  checkpoint: true, // ✅ Save checkpoint here
  // ...
}
```

### **3. Idempotency**

**What**: Running the same step twice produces the same result

**How**: Checks `isStepCompleted()` before executing

**Example**:

```typescript
if (isCompleted && !resumeFrom) {
  Logger.info('Step already completed, skipping...');
  continue; // Don't run again
}
```

### **4. Error Handling**

**Required Steps** (`required: true`):

```typescript
try {
  await step.command();
} catch (error) {
  markStepFailed(step.name);
  throw error; // ❌ STOP PIPELINE
}
```

**Optional Steps** (`required: false`):

```typescript
try {
  await step.command();
} catch (error) {
  markStepSkipped(step.name);
  Logger.warn('Optional step failed, continuing...');
  // ✅ CONTINUE PIPELINE
}
```

### **5. Step Dependencies**

**How**: Steps access data from previous steps via state metadata

**Example**:

```typescript
// Step 2 uses data from Step 1
const state = await stateManager.load();
const deployedContracts = state.metadata['deploy-contracts'].result;
// Use deployedContracts in configure-permissions
```

## 📊 Execution Flow Diagram

```
START
  │
  ├─► Load State (.state/{uuid}.json)
  │   │
  │   ├─► State exists? ──NO──► Initialize new state
  │   │   │
  │   └─► YES ──► Load state
  │
  ├─► Determine Start Index
  │   │
  │   ├─► Resume from checkpoint? ──YES──► Start from checkpoint
  │   │   │
  │   └─► NO ──► Start from beginning
  │
  └─► Execute Steps Loop
      │
      ├─► For each step:
      │   │
      │   ├─► Already completed? ──YES──► Skip step
      │   │   │
      │   └─► NO ──► Execute step
      │       │
      │       ├─► Success? ──YES──► Mark complete → Save checkpoint
      │       │   │
      │       └─► NO ──► Handle error
      │           │
      │           ├─► Required step? ──YES──► Mark failed → STOP PIPELINE ❌
      │           │   │
      │           └─► NO ──► Mark skipped → CONTINUE ⚠️
      │
      └─► All steps done? ──YES──► Mark completed ✅
```

## 🎮 Usage Examples

### **1. Normal Execution**

```bash
./setup.sh
# Runs: validate → deploy-contracts → configure-permissions → save-state
```

### **2. Resume from Failure**

```bash
# Pipeline failed at step 2, resume from there
npx ts-node pipelines/deploy-pipeline.ts configure-permissions
```

### **3. Check Status**

```bash
npx ts-node pipelines/deploy-pipeline.ts --status
# Shows: completed steps, failed steps, last checkpoint
```

### **4. Force Re-run**

```bash
# Delete state file first
rm .state/{projectUUID}.json
./setup.sh
```

## 🔧 Integration with setup.sh

The pipeline is called from `setup.sh`:

```bash
blockchain_setup() {
    # Use new modular pipeline if available
    if [ -f "$SCRIPT_DIR/pipelines/deploy-pipeline.ts" ]; then
        npx ts-node "$SCRIPT_DIR/pipelines/deploy-pipeline.ts"
    else
        # Fallback to legacy script
        npx ts-node "$SCRIPT_DIR/_setup-deployment.ts"
    fi
}
```

**Flow**:

1. `setup.sh` → `validate_environment()`
2. `setup.sh` → `blockchain_setup()` → **Pipeline**
3. `setup.sh` → `graph_setup()`
4. `setup.sh` → `update_database()`

## 💡 Benefits

### **1. Resumability**

- ✅ Can resume from any checkpoint
- ✅ No need to redeploy contracts if pipeline fails later

### **2. Reliability**

- ✅ Tracks what's been done
- ✅ Prevents duplicate operations
- ✅ Clear error boundaries

### **3. Debuggability**

- ✅ Know exactly where it failed
- ✅ Can inspect state file
- ✅ Clear step-by-step logging

### **4. Flexibility**

- ✅ Can run individual steps
- ✅ Can skip optional steps
- ✅ Can resume from any point

## 🎯 Summary

The **Deployment Pipeline** is a **stateful orchestrator** that:

1. **Executes steps sequentially** with dependencies
2. **Tracks progress** in `.state/{projectUUID}.json`
3. **Saves checkpoints** for resumability
4. **Handles errors** based on step criticality
5. **Skips completed steps** for idempotency

It transforms a **monolithic deployment script** into a **resumable, trackable, and reliable** deployment process.
