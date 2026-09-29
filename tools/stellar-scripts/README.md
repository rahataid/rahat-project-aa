# Stellar Scripts

This directory contains various scripts for interacting with the Stellar network.

## Scripts

1. `1-sponsor-account-with-trustline.js` - Sponsors a new account and creates a trustline in a single transaction
2. `2-send-to-sponsored.js` - Sends assets to a sponsored account
3. `3-sponsored-sends-asset.js` - Has a sponsored account send assets
4. `4-revoke-sponsorship-and-trustline.js` - Revokes sponsorship of an account and removes its trustline to the sponsor's asset
5. `bulk-sponsor-batch.js` - Bulk sponsorship using multiple transactions
6. `bulk-sponsor-single-tx.js` - Bulk sponsorship using a single transaction
7. `batch-revoke-trustline.js` - Batch revoke sponsorship and remove trustlines from CSV file

## Usage

Each script requires environment variables to be set in a `.env` file. See individual scripts for required variables.

Example `.env`:
```
NETWORK=TESTNET
SPONSOR_SECRET=SA... (sponsor secret key)
BENEFICIARY_SECRET=SB... (beneficiary secret key)
ASSET_CODE=USD
HORIZON_URL=https://horizon-testnet.stellar.org
CSV_FILE=sample-beneficiaries.csv
```

Run a script with:
```bash
node <script-name>.js
```

### batch-revoke-trustline.js

Batch revokes account sponsorship and removes trustlines for multiple beneficiaries from a CSV file.

**Required inputs:**
- Horizon URL (or `HORIZON_URL` env var)
- Network: TESTNET or MAINNET (or `NETWORK` env var)
- Sponsor Secret Key (or `SPONSOR_SECRET` env var)
- CSV File Path in same folder (or `CSV_FILE` env var)
- Asset Code (or `ASSET_CODE` env var)

**CSV Format:**
```
public_key,secret_key
GB3KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y5Y,SB3KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y5Z
GB4KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y5Z,SB4KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y6A
```

**Example:**
```bash
node batch-revoke-trustline.js
```

**Environment variables:**
```
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK=TESTNET
SPONSOR_SECRET=S...
CSV_FILE=sample-beneficiaries.csv
ASSET_CODE=USD
ASSET_ISSUER=G...  # Asset issuer public key (may differ from sponsor)
SPONSOR_PAYS=true  # Set to 'true' for sponsor to pay trustline removal fees
```

**Asset Issuer vs Sponsor:**
The asset issuer (`ASSET_ISSUER`) is the account that originally issued the asset and created the trustlines. This may be different from the sponsor (`SPONSOR_SECRET`). The script now asks for this separately.

**Execution Order (important):**
1. **Send balance to asset issuer** (if any) - must clear asset balance before removing trustline
2. **Remove trustline** - frees up reserve from the trustline
3. **Revoke sponsorship** - account can now meet its own reserve requirement

This order prevents `op_invalid_limit` (balance > 0) and `op_low_reserve` errors.

**Sponsor pays for trustline removal:**
When `SPONSOR_PAYS=true` (or answer 'y' to the prompt), the script builds the trustline removal transaction with:
- Sponsor account as transaction source (pays fee)
- `changeTrust` operation with `source: beneficiaryPublicKey` (affects beneficiary's trustline)
- Both sponsor and beneficiary must sign the transaction

This is useful when beneficiaries have 0 XLM and cannot pay transaction fees.

**CSV Format:**
```csv
public_key,secret_key
GB3KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y5Y,SB3KJOLZ5LF6JEFZ6GYCI6NQWXGZGCWFVGCHGQEZTCQIIYXEHY5Y6Y5Z
```
First line is treated as header and skipped automatically.