# RAHAT Process - Bulk Sponsor with Trustline

Streamlined workflow for bulk creating sponsored accounts with RAHAT trustlines already set up.

## Overview

All accounts created through these scripts:
- **0 XLM balance** (fully sponsored)
- **RAHAT trustline ready** (sponsored reserve)
- Saved to JSON for easy tracking
- Ready to receive RAHAT immediately

## Scripts

### 1. `1-sponsor-account-with-trustline.js`

Single account creation with trustline.

**Run:**
```bash
node 1-sponsor-account-with-trustline.js
```

**Output:**
- Account public + secret keys
- Trustline ready for RAHAT

---

### 2. `bulk-sponsor-single-tx.js`

Create **up to 16 accounts** in one transaction with trustlines.

**What it does:**
- 6 operations per account (begin, create, end, begin, trustline, end)
- Max 16 accounts (signature limit: 20 - 1 sponsor - buffer)
- Saves all accounts to `sponsored-accounts-TIMESTAMP.json`

**Run:**
```bash
node bulk-sponsor-single-tx.js
```

**Input:**
- Number of accounts (max 16)

**Output:**
- JSON file with all account details
- Each account has 0 XLM + RAHAT trustline

**JSON format:**
```json
{
  "sponsor": "GBDKVXW...",
  "asset": "RAHAT",
  "network": "TESTNET",
  "timestamp": "2026-06-08T...",
  "transactionHash": "abc123...",
  "accounts": [
    {
      "index": 1,
      "publicKey": "GC...",
      "secretKey": "SC..."
    }
  ]
}
```

---

### 3. `bulk-sponsor-batch.js`

Create **unlimited accounts** in batches with trustlines.

**What it does:**
- Same as single-tx but processes in batches
- Recommended 10-16 accounts per batch
- Saves all accounts to `sponsored-accounts-batch-TIMESTAMP.json`
- Rate-limited submission (500ms between batches)

**Run:**
```bash
node bulk-sponsor-batch.js
```

**Input:**
- Total number of accounts
- Accounts per batch (10-16 recommended)

**Output:**
- JSON file with all accounts + batch info

**JSON format:**
```json
{
  "sponsor": "GBDKVXW...",
  "asset": "RAHAT",
  "network": "TESTNET",
  "timestamp": "2026-06-08T...",
  "totalAccounts": 100,
  "batches": [
    {
      "batchIndex": 1,
      "count": 16,
      "transactionHash": "abc..."
    }
  ],
  "accounts": [
    {
      "index": 1,
      "publicKey": "GC...",
      "secretKey": "SC...",
      "batch": 1
    }
  ]
}
```

---

### 4. `2-send-to-sponsored.js`

Send RAHAT to sponsored accounts (from JSON file or manual input).

**Run:**
```bash
node 2-send-to-sponsored.js
```

---

### 5. `3-sponsored-sends-asset.js`

Sponsored account sends RAHAT with fee sponsorship.

**Run:**
```bash
node 3-sponsored-sends-asset.js
```

---

## Complete Workflow

### Small Scale (< 16 accounts)
```bash
# Create accounts with trustlines
node bulk-sponsor-single-tx.js
# Enter: 10

# JSON saved: sponsored-accounts-2026-06-08T12-30-45.json

# Send RAHAT to accounts
node 2-send-to-sponsored.js
# Use public keys from JSON
```

### Large Scale (100+ accounts)
```bash
# Create accounts with trustlines
node bulk-sponsor-batch.js
# Enter: 100 (total)
# Enter: 16 (per batch)

# JSON saved: sponsored-accounts-batch-2026-06-08T12-30-45.json

# Send RAHAT to accounts (loop through JSON)
node 2-send-to-sponsored.js
# Use public keys from JSON
```

---

## Limits & Reserves

**Single transaction limits:**
- **Operations**: 100 max (6 per account = ~16 accounts)
- **Signatures**: 20 max (1 sponsor + 16 accounts + buffer = 17)
- **Practical limit**: 16 accounts per transaction

**Reserves per account:**
- Account reserve: 0.5 XLM (locked on sponsor)
- Trustline reserve: 0.5 XLM (locked on sponsor)
- **Total per account: 1 XLM locked on sponsor**

**Examples:**
- 10 accounts = 10 XLM locked
- 100 accounts = 100 XLM locked
- 1000 accounts = 1000 XLM locked

**Sponsor needs:**
```
Required balance = 1 XLM (own reserve)
                 + (N × 1 XLM) (sponsored accounts)
                 + transaction fees

For 100 accounts: ~102 XLM minimum
```

---

## Notes

- All reserves are **locked, not spent** - can revoke sponsorship to unlock
- Accounts maintain **0 XLM** throughout lifecycle
- JSON files store all secrets - **keep secure!**
- Each account ready to receive RAHAT immediately after creation
- No need to run separate trustline scripts
