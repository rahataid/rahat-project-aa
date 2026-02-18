# Production Setup Scripts Analysis & Recommendations

## 🔍 Current Issues Identified

### 1. **Critical Path Inconsistencies**

**Problem**: Deployment file paths are inconsistent across scripts:

- `_setup-deployment.ts` writes to: `${__dirname}/deployments/{projectUUID}.json`
- `_modify-graph-contracts.ts` reads from: `${__dirname}/.data/deployments/{projectUUID}.json`
- `generate-deployment-keys.ts` uses: `${__dirname}/.data/`

**Impact**: Scripts will fail when trying to read deployment files.

**Fix**: Standardize on a single directory structure.

---

### 2. **Data Structure Mismatch**

**Problem**:

- `_setup-deployment.ts` writes contracts at root level: `{AAProject: {...}, RahatToken: {...}}`
- `_modify-graph-contracts.ts` expects: `{CONTRACTS: {AAProject: {...}, RahatToken: {...}}}`

**Impact**: Graph modification script fails to read contract addresses.

**Fix**: Align data structure or update reading logic.

---

### 3. **Missing Script: `update-deployment.ts`**

**Problem**: Referenced in `deployments.md` (step 8) but doesn't exist in project.

**Expected Functionality** (based on rahat-platform version):

- Read deployment files
- Update database with deployed contracts
- Add blockchain settings
- Add subgraph URL settings
- Add contract settings

**Impact**: Cannot complete deployment workflow as documented.

---

### 4. **Hardcoded Subgraph Configuration**

**Problem**: `subgraph.yaml` has hardcoded addresses instead of using `networks.json` dynamically.

**Current**: Each network requires manual editing of `subgraph.yaml`.

**Impact**: Error-prone, not scalable for multiple networks.

**Fix**: Use template-based generation or The Graph's template system.

---

### 5. **Missing Environment Validation**

**Problem**: No validation script to check required environment variables before deployment.

**Missing Checks**:

- `PROJECT_ID` / `PROJECT_UUID`
- `DEPLOYER_PRIVATE_KEY`
- `RAHAT_CORE_URL`
- `CHAIN_RPCURL`, `CHAIN_NAME`, `CHAIN_ID`
- `SUBGRAPH_NETWORK`, `SUBGRAPH_NAME`, `SUBGRAPH_AUTH_TOKEN`

**Impact**: Deployment fails late with cryptic errors.

---

### 6. **Missing Deployment Verification**

**Problem**: No script to verify deployed contracts are correct.

**Missing Checks**:

- Verify contract addresses are valid
- Verify contract ABIs match
- Verify network connectivity
- Verify contract permissions/roles are set correctly

---

### 7. **Inconsistent Environment File Naming**

**Problem**: Scripts use different env file names:

- `_modify-graph-contracts.ts` uses: `.env.prod`
- `add-cashtracker-subgraph.ts` uses: `.env.setup`
- `_setup-deployment.ts` uses: `.env` (default)

**Impact**: Confusion about which env file to configure.

---

### 8. **Missing Rollback/Recovery Scripts**

**Problem**: No way to rollback or recover from failed deployments.

**Impact**: Manual intervention required for failed deployments.

---

## 📋 Missing Scripts

### 1. **`update-deployment.ts`** (CRITICAL)

**Purpose**: Update database with deployed contracts and settings.

**Should include**:

- Read deployment JSON files
- Update CONTRACT settings in database
- Update BLOCKCHAIN settings
- Update SUBGRAPH_URL settings
- Update CHAIN_SETTINGS

**Location**: `tools/project-scripts/production-setup/update-deployment.ts`

---

### 2. **`validate-env.ts`**

**Purpose**: Validate all required environment variables before deployment.

**Should check**:

- Required env vars exist
- Database connectivity
- Blockchain RPC connectivity
- Rahat Core API connectivity
- Private key format validation

**Location**: `tools/project-scripts/production-setup/validate-env.ts`

---

### 3. **`verify-deployment.ts`**

**Purpose**: Verify deployed contracts are correct and functional.

**Should verify**:

- Contract addresses are valid
- Contracts are deployed on correct network
- Contract permissions are set correctly
- Contract ABIs match expected versions

**Location**: `tools/project-scripts/production-setup/verify-deployment.ts`

---

### 4. **`generate-subgraph-config.ts`**

**Purpose**: Generate `subgraph.yaml` from `networks.json` for specific network.

**Should**:

- Read `networks.json` for target network
- Generate `subgraph.yaml` with correct addresses
- Support multiple networks dynamically

**Location**: `tools/project-scripts/production-setup/generate-subgraph-config.ts`

---

### 5. **`rollback-deployment.ts`**

**Purpose**: Rollback deployment if something goes wrong.

**Should**:

- Track deployment state
- Allow selective rollback
- Clean up failed deployments

**Location**: `tools/project-scripts/production-setup/rollback-deployment.ts`

---

### 6. **`.env.setup.example`**

**Purpose**: Template for environment configuration.

**Should document**:

- All required variables
- Optional variables
- Example values
- Network-specific configurations

**Location**: `tools/project-scripts/production-setup/.env.setup.example`

---

## 🏗️ Recommended Design Pattern / Structure

### **Proposed Structure**

```
production-setup/
├── .env.setup.example          # Environment template
├── _common.ts                   # Shared utilities (ContractLib)
├── _setup-deployment.ts         # Main deployment orchestrator
├── _modify-graph-contracts.ts   # Update networks.json
├── update-deployment.ts         # ⚠️ MISSING - Update database
├── validate-env.ts              # ⚠️ MISSING - Pre-flight checks
├── verify-deployment.ts         # ⚠️ MISSING - Post-deployment verification
├── generate-subgraph-config.ts  # ⚠️ MISSING - Generate subgraph.yaml
├── rollback-deployment.ts       # ⚠️ MISSING - Rollback capability
├── add-cashtracker-subgraph.ts  # Add subgraph URL
├── add-cash-tracker-entities.ts # Add entities
├── generate-deployment-keys.ts  # Generate keys
├── setup.sh                     # Main orchestrator script
├── deployments/                 # ⚠️ STANDARDIZE - Deployment files
│   └── {projectUUID}.json
├── .data/                       # Alternative data storage (if needed)
│   └── deployments/
│       └── {projectUUID}.json
└── README.md                    # Documentation
```

---

### **Design Pattern: Deployment Pipeline**

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Pre-Deployment Validation                       │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ validate-env.ts                                     │ │
│ │ - Check env vars                                    │ │
│ │ - Verify connectivity                               │ │
│ │ - Validate keys                                      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Contract Deployment                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ _setup-deployment.ts                                 │ │
│ │ - Deploy contracts                                   │ │
│ │ - Configure permissions                              │ │
│ │ - Save to deployments/{UUID}.json                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Post-Deployment Verification                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ verify-deployment.ts                                 │ │
│ │ - Verify contracts                                   │ │
│ │ - Check permissions                                 │ │
│ │ - Validate addresses                                 │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 4: Graph Configuration                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ _modify-graph-contracts.ts                          │ │
│ │ - Update networks.json                              │ │
│ │                                                      │ │
│ │ generate-subgraph-config.ts                         │ │
│ │ - Generate subgraph.yaml                            │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 5: Database & Settings Update                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ update-deployment.ts                                 │ │
│ │ - Update CONTRACT settings                          │ │
│ │ - Update BLOCKCHAIN settings                        │ │
│ │ - Update SUBGRAPH_URL                               │ │
│ │                                                      │ │
│ │ add-cashtracker-subgraph.ts                         │ │
│ │ - Add subgraph URL to database                      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### **Standardized Data Structure**

**Deployment File Format** (`deployments/{projectUUID}.json`):

```json
{
  "projectId": "uuid-here",
  "network": "base-sepolia",
  "deployedAt": "2024-01-01T00:00:00Z",
  "contracts": {
    "AAProject": {
      "address": "0x...",
      "startBlock": 123456,
      "abi": [...]
    },
    "RahatToken": {
      "address": "0x...",
      "startBlock": 123457,
      "abi": [...]
    }
  },
  "chainSettings": {
    "name": "base-sepolia",
    "chainId": 84532,
    "rpcUrl": "https://...",
    "explorerUrl": "https://..."
  },
  "subgraphUrl": {
    "url": "https://api.studio.thegraph.com/..."
  }
}
```

---

### **Environment Configuration Pattern**

**Single `.env.setup` file** with all required variables:

```bash
# Project Configuration
PROJECT_ID=uuid-here
PROJECT_UUID=uuid-here

# Blockchain Configuration
CHAIN_NAME=base-sepolia
CHAIN_TYPE=testnet
CHAIN_RPCURL=https://sepolia.base.org
CHAIN_ID=84532
CHAIN_CURRENCY_NAME=Ether
CHAIN_CURRENCY_SYMBOL=ETH
CHAIN_EXPLORER_URL=https://sepolia.basescan.org

# Deployment Keys
DEPLOYER_PRIVATE_KEY=0x...

# Rahat Core Configuration
RAHAT_CORE_URL=https://core.rahat.io/v1
CORE_DATABASE_URL=postgresql://...

# Subgraph Configuration
SUBGRAPH_NETWORK=base-sepolia
SUBGRAPH_NAME=rahat-aa-stage
SUBGRAPH_AUTH_TOKEN=...
SUBGRAPH_QUERY_URL=https://api.studio.thegraph.com/...
```

---

### **Error Handling Pattern**

Each script should:

1. **Validate inputs** before execution
2. **Log all actions** with timestamps
3. **Handle errors gracefully** with rollback capability
4. **Return exit codes** for script chaining
5. **Create deployment state** for recovery

---

### **Modular Architecture**

**Base Class Pattern**:

```typescript
abstract class BaseDeploymentScript {
  protected projectUUID: string;
  protected deploymentFile: string;

  abstract execute(): Promise<void>;

  protected validate(): Promise<boolean>;
  protected log(action: string, data: any): void;
  protected rollback(): Promise<void>;
}
```

**Scripts inherit and implement**:

- `_setup-deployment.ts` → `ContractDeploymentScript`
- `update-deployment.ts` → `DatabaseUpdateScript`
- `verify-deployment.ts` → `VerificationScript`

---

## 🎯 Priority Actions

### **High Priority** (Blockers)

1. ✅ Fix path inconsistencies (`deployments/` vs `.data/deployments/`)
2. ✅ Fix data structure mismatch (root vs `CONTRACTS` key)
3. ✅ Create `update-deployment.ts` script
4. ✅ Create `.env.setup.example` template
5. ✅ Standardize environment file naming

### **Medium Priority** (Important)

6. ✅ Create `validate-env.ts` script
7. ✅ Create `verify-deployment.ts` script
8. ✅ Create `generate-subgraph-config.ts` script
9. ✅ Update `setup.sh` to use new pipeline

### **Low Priority** (Nice to Have)

10. ✅ Create `rollback-deployment.ts` script
11. ✅ Add comprehensive error handling
12. ✅ Add deployment state tracking
13. ✅ Create deployment documentation

---

## 📝 Summary

The production setup scripts need:

- **Path standardization** (deployments directory)
- **Data structure alignment** (contract format)
- **Missing critical scripts** (update-deployment, validation, verification)
- **Subgraph configuration automation** (generate from networks.json)
- **Environment variable standardization** (single .env.setup)
- **Error handling and rollback** (recovery capability)

Following the pipeline pattern above will create a robust, maintainable deployment system that matches the documented workflow in `deployments.md`.
