# Stellar Scripts

This directory contains various scripts for interacting with the Stellar network.

## Scripts

1. `1-sponsor-account-with-trustline.js` - Sponsors a new account and creates a trustline in a single transaction
2. `2-send-to-sponsored.js` - Sends assets to a sponsored account
3. `3-sponsored-sends-asset.js` - Has a sponsored account send assets
4. `4-revoke-sponsorship-and-trustline.js` - Revokes sponsorship of an account and removes its trustline to the sponsor's asset
5. `bulk-sponsor-batch.js` - Bulk sponsorship using multiple transactions
6. `bulk-sponsor-single-tx.js` - Bulk sponsorship using a single transaction

## Usage

Each script requires environment variables to be set in a `.env` file. See individual scripts for required variables.

Example `.env`:
```
NETWORK=TESTNET
SPONSOR_SECRET=SA... (sponsor secret key)
BENEFICIARY_SECRET=SB... (beneficiary secret key)
ASSET_CODE=USD
```

Run a script with:
```bash
node <script-name>.js
```