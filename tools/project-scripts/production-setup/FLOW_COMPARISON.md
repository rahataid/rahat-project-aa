# Deployment Flow Comparison: Old vs New

## 📋 Flow Comparison

### Old Flow (`_setup-deployment.ts`):
1. **Deploy Contracts** → Write to file → Sleep 20s
2. **Configure Permissions** (grantRole, registerProject)
3. **Add Contract Settings** → DB (`CONTRACT`, `CONTRACTS`)
4. **Add Network Provider** → DB (`BLOCKCHAIN`) - uses `getNetworkSettings()`
5. **Add Chain Settings** → DB (`CHAIN_SETTINGS`)

### New Flow (`deploy-pipeline.ts` + `setup.sh`):
1. **Validate Environment** → `validate-env.ts`
2. **Deploy Contracts** → `deploy-contracts.ts` → Save to state
3. **Configure Permissions** → `configure-permissions.ts` → Sleep 20s ✅
4. **Save Deployment State** → `save-deployment-state.ts` → Write to file
5. **Configure Graph Networks** → `configure-graph-networks.ts` → Update `networks.json`
6. **Deploy Subgraph** → `deploy-subgraph.ts` → Codegen, build, auth, deploy
7. **Update Database** → `update-deployment.ts` → All settings

## ✅ Pattern Consistency Check

### Command Pattern (All Commands Follow This):
```typescript
export class CommandName {
  constructor(stateManager: StateManager) { }
  async execute(command: CommandInput): Promise<Result> {
    Logger.setStep('step-name');
    // Check completion
    // Execute logic
    // Mark complete/failed
    Logger.clearStep();
  }
}
export async function commandName(...) { }
```

✅ **deploy-contracts.ts** - Follows pattern
✅ **configure-permissions.ts** - Follows pattern  
✅ **save-deployment-state.ts** - Follows pattern
✅ **configure-graph-networks.ts** - Follows pattern
✅ **deploy-subgraph.ts** - Follows pattern
✅ **update-database.ts** - Follows pattern

### Differences Found & Fixed:

1. ✅ **BLOCKCHAIN format** - Fixed to match DB format:
   - Old: `getNetworkSettings()` → `{ rpcUrl, chainName, chainId, blockExplorerUrls }`
   - New: `{ RPCURL, CHAINNAME, NATIVECURRENCY: { NAME, SYMBOL } }` ✅

2. ✅ **Contract names** - Fixed to match old flow:
   - Old: `['AAProject', 'RahatDonor', 'RahatToken']` (3 contracts)
   - New: `['AAProject', 'RahatDonor', 'RahatToken']` ✅

3. ✅ **Unused variable** - Removed from `configure-graph-networks.ts`

4. ✅ **Step order** - Improved:
   - Old: Deploy → Write file → Sleep → Permissions
   - New: Deploy → Permissions (with sleep) → Write file ✅
   - (Better: permissions happen immediately after deployment)

5. ✅ **Graph setup** - Now modularized:
   - Old: Manual steps in `setup.sh`
   - New: `configure-graph-networks.ts` + `deploy-subgraph.ts` ✅

## 🔍 Key Improvements

### ✅ Better Separation of Concerns
- Contract deployment separated from database updates
- Graph setup separated into dedicated commands
- Each step is independently resumable

### ✅ Consistent Error Handling
- All commands use try/catch/finally
- State tracking for failures
- Checkpoint system for resumability

### ✅ Better Logging
- All commands use `Logger` service
- Structured logging with step context
- Debug mode support

### ✅ State Management
- All commands check completion status
- Resumable from any checkpoint
- State persisted in `.state/` directory

## ⚠️ Remaining Differences (Intentional)

1. **Database update location**:
   - Old: Same script as deployment
   - New: Separate script (called after graph deployment) ✅ Better

2. **Contract storage**:
   - Old: Only 3 contracts in DB
   - New: Only 3 contracts in DB ✅ Matches old behavior

3. **BLOCKCHAIN format**:
   - Old: Used `getNetworkSettings()` (different format)
   - New: Matches DB format exactly ✅ Fixed

## ✅ Verification Checklist

- [x] All commands follow same pattern
- [x] All commands use Logger
- [x] All commands use StateManager
- [x] All commands check completion status
- [x] BLOCKCHAIN format matches DB
- [x] Contract names match old flow
- [x] Sleep/delay preserved in permissions step
- [x] Graph setup modularized
- [x] Database update separated (better design)
- [x] Backward compatibility maintained

## 📝 Summary

The new flow **follows the pattern** and is **improved**:
- ✅ All commands follow consistent structure
- ✅ Better separation of concerns
- ✅ Improved error handling and logging
- ✅ Resumable from checkpoints
- ✅ Matches old behavior where needed
- ✅ Fixed format inconsistencies

The flow is production-ready and maintains backward compatibility.


