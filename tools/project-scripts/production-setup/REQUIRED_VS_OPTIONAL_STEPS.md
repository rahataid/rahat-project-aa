# Required vs Optional Steps

## 🔴 Critical Steps (Cannot Be Skipped)

These steps **MUST** succeed for the deployment to be considered successful. If any of these fail, the pipeline will **stop** and mark the deployment as failed.

### 1. **deploy-contracts** ✅ REQUIRED
- **Why**: Core functionality depends on deployed contracts
- **Failure Impact**: Deployment cannot proceed without contracts
- **Behavior**: Throws error → Pipeline stops

### 2. **configure-permissions** ✅ REQUIRED  
- **Why**: `registerProject` in RahatDonor is essential for project functionality
- **Failure Impact**: Project won't be registered in Rahat Core
- **Behavior**: 
  - `grantRole` failures → Warning (can be done manually)
  - `registerProject` failure → **Throws error** → Pipeline stops

### 3. **save-deployment-state** ✅ REQUIRED
- **Why**: Needed for graph configuration and database updates
- **Failure Impact**: Subsequent steps cannot access deployment data
- **Behavior**: Throws error → Pipeline stops

### 4. **update-database** ✅ REQUIRED
- **Why**: Application needs contract addresses and settings in database
- **Failure Impact**: Application won't know about deployed contracts
- **Behavior**: Throws error → Pipeline stops

## 🟡 Optional Steps (Can Be Skipped)

These steps can fail without stopping the deployment. They will be marked as "skipped" and the pipeline will continue.

### 1. **deploy-subgraph** ⚠️ OPTIONAL
- **Why**: Subgraph is useful but not critical for basic functionality
- **Failure Impact**: 
  - Missing config → Skipped gracefully
  - Deployment failure → Skipped with warning
- **Behavior**: 
  - Missing config → Returns early, marks as skipped
  - Real error → Could be made optional in pipeline

### 2. **configure-graph-networks** ⚠️ OPTIONAL (if subgraph skipped)
- **Why**: Only needed if deploying subgraph
- **Failure Impact**: Subgraph won't have correct addresses
- **Behavior**: Currently throws, but could be optional

## 📋 Current Implementation

### Pipeline Step Definition
```typescript
export interface PipelineStep {
  name: string;
  description: string;
  command: () => Promise<void>;
  checkpoint: boolean; // Can resume from here
  required: boolean; // If false, step can be skipped on error (default: true)
}
```

### Error Handling Logic
```typescript
if (isRequired) {
  // Required step failed - stop pipeline
  Logger.error(`❌ CRITICAL STEP FAILED: '${step.name}' is required`);
  throw error; // Pipeline stops
} else {
  // Optional step failed - log warning and continue
  Logger.warn(`⚠️  Optional step '${step.name}' failed but continuing...`);
  // Mark as skipped instead of failed
  await stateManager.markStepComplete(step.name, {
    skipped: true,
    reason: error.message,
  });
  // Pipeline continues
}
```

## 🔍 Step-by-Step Breakdown

### Within `configure-permissions`:
- **grantRole to RahatDonor**: ⚠️ Optional (can be done manually)
- **registerProject**: 🔴 **CRITICAL** (throws error)
- **grantRole to deployer**: ⚠️ Optional (can be done manually)

### Within `deploy-subgraph`:
- **Missing config check**: ⚠️ Optional (returns early, marks skipped)
- **Codegen/Build/Auth/Deploy**: ⚠️ Optional (could fail gracefully)

## 🎯 Best Practices

1. **Always mark critical operations explicitly**:
   ```typescript
   required: true, // CRITICAL: Cannot skip
   ```

2. **Document why a step is required**:
   ```typescript
   required: true, // CRITICAL: registerProject is essential
   ```

3. **Handle partial failures within steps**:
   ```typescript
   try {
     await nonCriticalOperation();
   } catch (error) {
     Logger.warn('Non-critical operation failed, continuing...');
     // Don't throw - continue
   }
   
   try {
     await criticalOperation();
   } catch (error) {
     Logger.error('Critical operation failed');
     throw error; // Stop execution
   }
   ```

4. **Use clear error messages**:
   ```typescript
   Logger.error('❌ CRITICAL STEP FAILED: registerProject is required');
   ```

## 📊 Summary Table

| Step | Required | Failure Behavior | Can Resume |
|------|----------|------------------|------------|
| deploy-contracts | ✅ Yes | Stop pipeline | ✅ Yes |
| configure-permissions | ✅ Yes* | Stop if registerProject fails | ✅ Yes |
| save-deployment-state | ✅ Yes | Stop pipeline | ✅ Yes |
| configure-graph-networks | ⚠️ No | Continue with warning | ✅ Yes |
| deploy-subgraph | ⚠️ No | Skip if config missing | ✅ Yes |
| update-database | ✅ Yes | Stop pipeline | ✅ Yes |

*Note: `configure-permissions` has mixed behavior - some operations are optional, but `registerProject` is critical.

