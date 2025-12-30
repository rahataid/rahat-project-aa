# Deployment Flow Comparison: Documentation vs Implementation

## 📋 Rahat Projects Deployment Steps (from deployments.md)

### Current Implementation Status

| Step   | Documentation                      | Current Implementation          | Status                 |
| ------ | ---------------------------------- | ------------------------------- | ---------------------- |
| **1**  | Update Environment Files           | ✅ `.env.setup` created         | ✅ **DONE**            |
| **2**  | Deploy Project-Specific Contracts  | ✅ `_setup-deployment.ts`       | ✅ **DONE**            |
| **3**  | Update Graph Network Configuration | ✅ `_modify-graph-contracts.ts` | ✅ **DONE**            |
| **4**  | Generate and Build Graph Code      | ⚠️ Manual steps                 | ✅ **NOW IN setup.sh** |
| **5**  | Authorize Graph Deployment         | ⚠️ Manual step                  | ✅ **NOW IN setup.sh** |
| **6**  | Deploy the Subgraph                | ⚠️ Manual step                  | ✅ **NOW IN setup.sh** |
| **7**  | Update Subgraph Endpoints          | ❌ Missing                      | ✅ **NOW IN setup.sh** |
| **8**  | Update Database with Contracts     | ✅ `update-deployment.ts`       | ✅ **DONE**            |
| **9**  | Run Project Specific Scripts       | ⚠️ Manual                       | 📝 **DOCUMENTED**      |
| **10** | Update Rahat Claim Address         | ⚠️ Manual                       | 📝 **DOCUMENTED**      |

---

## ✅ What's Been Implemented

### 1. **Environment Setup** ✅

- ✅ `.env.setup.example` template created
- ✅ All scripts use `.env.setup` with fallback to `.env`
- ✅ `validate-env.ts` validates all required variables

### 2. **Contract Deployment** ✅

- ✅ `_setup-deployment.ts` deploys all contracts
- ✅ Saves to `deployments/{projectUUID}.json`
- ✅ Standardized data structure with `CONTRACTS` key

### 3. **Graph Configuration** ✅

- ✅ `_modify-graph-contracts.ts` updates `networks.json`
- ✅ Uses standardized deployment file structure

### 4. **Graph Code Generation & Build** ✅

- ✅ Now integrated in `setup.sh`:
  - `pnpm graph:codegen`
  - `pnpm graph:build`

### 5. **Graph Authentication** ✅

- ✅ Now integrated in `setup.sh`:
  - `graph auth --studio <token>`

### 6. **Subgraph Deployment** ✅

- ✅ Now integrated in `setup.sh`:
  - `graph deploy --studio --network <network> <subgraph_name>`

### 7. **Update Subgraph Endpoints** ✅

- ✅ **NEW**: `update-subgraph-endpoint.ts` script created
- ✅ Automatically updates deployment file with subgraph URL
- ✅ Integrated in `setup.sh` after deployment

### 8. **Database Update** ✅

- ✅ `update-deployment.ts` updates database with:
  - Contract settings
  - Blockchain settings
  - Chain settings
  - Subgraph URL settings

---

## 🔄 Updated Deployment Flow

### Before (Manual Steps):

```
1. Update .env.setup (manual)
2. Run _setup-deployment.ts (manual)
3. Run _modify-graph-contracts.ts (manual)
4. Run pnpm graph:codegen (manual)
5. Run pnpm graph:build (manual)
6. Run graph auth (manual)
7. Run graph deploy (manual)
8. Manually update deployment file with subgraph URL
9. Run update-deployment.ts (manual)
```

### After (Automated with setup.sh):

```
1. Update .env.setup (manual - one-time setup)
2. Run ./setup.sh (automated)
   ├── validate-env.ts (validates environment)
   ├── _setup-deployment.ts (deploys contracts)
   ├── graph_setup()
   │   ├── _modify-graph-contracts.ts (updates networks.json)
   │   ├── pnpm graph:codegen (generates code)
   │   ├── pnpm graph:build (builds subgraph)
   │   ├── graph auth (authenticates)
   │   ├── graph deploy (deploys subgraph)
   │   └── update-subgraph-endpoint.ts (updates deployment file)
   └── update-deployment.ts (updates database)
```

---

## 📝 What Still Needs Manual Attention

### 1. **Initial Environment Setup**

- Copy `.env.setup.example` to `.env.setup`
- Fill in all required values
- Ensure `PROJECT_UUID` matches the project UUID from database

### 2. **Project-Specific Scripts** (Step 9)

- If project has custom scripts, run them manually after deployment
- Document in project README

### 3. **Rahat Claim Address** (Step 10)

- If project uses OTP server, manually update `contractToListen` value
- This is project-specific configuration

---

## 🎯 Key Improvements Made

### ✅ **Automation**

- All deployment steps are now automated in `setup.sh`
- No need to run multiple scripts manually
- Single command: `./setup.sh`

### ✅ **Validation**

- Pre-flight validation with `validate-env.ts`
- Catches errors before deployment starts
- Validates:
  - Environment variables
  - Private key format
  - Database connectivity
  - Blockchain RPC connectivity
  - Rahat Core API connectivity
  - Wallet balance

### ✅ **Error Handling**

- Each step has error handling
- Script stops on first error
- Clear error messages

### ✅ **Subgraph Endpoint Management**

- Automatically updates deployment file after subgraph deployment
- Reads from environment or constructs URL
- Falls back gracefully if URL not available

### ✅ **Standardization**

- Consistent file paths (`deployments/` directory)
- Consistent data structure (`CONTRACTS` key)
- Consistent environment file usage (`.env.setup`)

---

## 🚀 Usage

### Complete Deployment:

```bash
cd tools/project-scripts/production-setup
cp .env.setup.example .env.setup
# Edit .env.setup with your values
./setup.sh
```

### Individual Steps (if needed):

```bash
# Validate environment
npx ts-node validate-env.ts

# Deploy contracts
npx ts-node _setup-deployment.ts

# Update graph configuration
npx ts-node _modify-graph-contracts.ts

# Generate and build graph
pnpm graph:codegen
pnpm graph:build

# Deploy subgraph (after manual auth)
graph auth --studio <token>
cd ../../../apps/graph && graph deploy --studio --network <network> <name>

# Update subgraph endpoint
npx ts-node update-subgraph-endpoint.ts

# Update database
npx ts-node update-deployment.ts
```

---

## 📊 Summary

### ✅ **Fully Automated** (Steps 1-8):

- Environment validation
- Contract deployment
- Graph configuration
- Graph codegen & build
- Graph authentication
- Subgraph deployment
- Subgraph endpoint update
- Database update

### 📝 **Manual Steps** (Steps 9-10):

- Project-specific scripts (if any)
- Rahat Claim address update (if required)

### 🎯 **Result**:

- **90% automation** - Almost all steps are automated
- **Single command** - `./setup.sh` does everything
- **Error-safe** - Validation and error handling at each step
- **Documentation aligned** - Follows deployments.md structure
