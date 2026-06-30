# @rahataid/stellar

Core Stellar SDK helpers for sponsored-account operations, built on top of
[`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk).
It wraps the transaction-building, sponsorship, signing, and submission logic
prototyped in `tools/stellar-scripts/` so callers don't need to know how
Stellar transactions are assembled.

## Usage

```ts
import { Keypair } from '@stellar/stellar-sdk';
import { StellarClient, StellarOperationError } from '@rahataid/stellar';

const stellar = new StellarClient({
  network: 'testnet', // or 'mainnet'
  sponsorSecret: process.env.STELLAR_SPONSOR_SECRET!,
  assetCode: process.env.STELLAR_ASSET_CODE!, // e.g. 'RAHAT'
  assetIssuer: process.env.STELLAR_ASSET_ISSUER!, // issuer public key
});

// Create one sponsored account + trustline (0 XLM, sponsor pays reserves)
const { account, hash } = await stellar.createSponsoredAccount();
// account = { publicKey: 'G...', secretKey: 'S...' }

// Batch-sponsor existing accounts — pass keypairs derived from beneficiary secrets
const keypairs = beneficiarySecrets.map((s) => Keypair.fromSecret(s));
const { accounts } = await stellar.createSponsoredAccountsBatch(keypairs);

// Sponsor sends the configured asset to a sponsored beneficiary
await stellar.sendToSponsored(account.publicKey, '50');

// Sponsored beneficiary sends the asset onward; sponsor pays the fee
await stellar.sendFromSponsored(account.secretKey, recipientPublicKey, '10');
```

### Error handling

Failed Horizon submissions are wrapped in `StellarOperationError`, which
carries `resultCodes` and `raw` from the Horizon response:

```ts
try {
  await stellar.sendToSponsored(destination, amount);
} catch (err) {
  if (err instanceof StellarOperationError) {
    logger.error('Stellar tx failed', { resultCodes: err.resultCodes });
  }
  throw err;
}
```

### Account queries

```ts
await stellar.accountExists(publicKey);
await stellar.hasTrustline(publicKey);
await stellar.getBalance(publicKey); // balance of the configured asset
await stellar.getNativeBalance(publicKey); // XLM balance
```

## Running unit tests

Run `nx test stellar` to execute the unit tests via [Jest](https://jestjs.io).
