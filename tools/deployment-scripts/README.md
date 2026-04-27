# Deployment Scripts Guide

This guide explains how to run the deployment setup scripts in order and then sync settings to the database.

## Location

All scripts are in `tools/deployment-scripts`.

## Prerequisites

- Install dependencies:
  - `pnpm install`
- Make sure your Prisma/database environment variables are set (for the final sync step).
- For contract deployment, ensure the selected deployer wallet has gas/native token balance.

## Run Order (Serial)

Run these scripts one by one from the repository root:

1. Create/select deployment JSON and project info:

```bash
node tools/deployment-scripts/0.setup-project.js
```

2. Add chain settings:

```bash
node tools/deployment-scripts/1.setup-chain-settings.js
```

3. Add forecast tab settings:

```bash
node tools/deployment-scripts/2.setup-forecast-tab.js
```

4. Setup keys (new wallet, mnemonic, or private key):

```bash
node tools/deployment-scripts/3.setup-keys.js
```

5. Deploy AA contracts and update `CONTRACT` + `CONTRACTS`:

```bash
node tools/deployment-scripts/4.setup-aa-contracts.js
```

6. Setup fund management tab config and related settings (Cash Tracker / Multi-Sig):

```bash
node tools/deployment-scripts/5.setup-fundManagement.js
```

7. Setup offramp settings:

```bash
node tools/deployment-scripts/6.setup-offramp-settings.js
```

Each script will prompt you to select the deployment file first, collect required inputs, and ask final confirmation before writing changes.

## Final Step: Update Settings via Prisma

After all setup scripts are completed, run this to upsert selected deployment settings into `tbl_settings` via Prisma:

```bash
node tools/deployment-scripts/update-settings-via-prisma.js
```

This script:
- asks you to pick a deployment JSON file,
- reads its `settings` array,
- upserts each setting into the database.

## Notes

- Deployment JSON files are stored in `tools/deployment-scripts/deployments`.
- You can rerun scripts safely; settings are updated if they already exist in the selected JSON file.
