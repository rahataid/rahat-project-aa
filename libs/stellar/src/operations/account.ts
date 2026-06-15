import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { CreateSponsoredAccountResult, CreateSponsoredAccountsBatchResult } from '../types';
import { submitTransaction } from './submit';

export interface AccountOpContext {
  server: Horizon.Server;
  networkPassphrase: string;
  sponsorKeypair: Keypair;
  asset: Asset;
}

/**
 * Stellar caps a transaction at 100 operations and 20 signatures. Each
 * sponsored account needs 6 operations (create account + trustline, each
 * wrapped in begin/endSponsoringFutureReserves) and 1 signature, plus the
 * sponsor's signature - so 16 accounts is the practical per-transaction limit.
 */
export const MAX_ACCOUNTS_PER_BATCH = 16;

const OPS_PER_ACCOUNT = 6;

/**
 * Creates a new account fully sponsored by the configured sponsor: the
 * account is created with 0 XLM and a trustline to the configured asset is
 * added, with the sponsor covering both reserves.
 */
export async function createSponsoredAccount(ctx: AccountOpContext): Promise<CreateSponsoredAccountResult> {
  const sponsored = Keypair.random();
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());

  const tx = new TransactionBuilder(sponsorAccount, {
    fee: (Number(BASE_FEE) * OPS_PER_ACCOUNT).toString(),
    networkPassphrase: ctx.networkPassphrase,
  })
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sponsored.publicKey() }))
    .addOperation(Operation.createAccount({ destination: sponsored.publicKey(), startingBalance: '0' }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: sponsored.publicKey() }))
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sponsored.publicKey() }))
    .addOperation(Operation.changeTrust({ asset: ctx.asset, source: sponsored.publicKey() }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: sponsored.publicKey() }))
    .setTimeout(100)
    .build();

  tx.sign(ctx.sponsorKeypair);
  tx.sign(sponsored);

  const result = await submitTransaction(ctx.server, tx);

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    account: { publicKey: sponsored.publicKey(), secretKey: sponsored.secret() },
  };
}

/**
 * Creates up to MAX_ACCOUNTS_PER_BATCH sponsored accounts (with trustlines)
 * in a single transaction.
 */
export async function createSponsoredAccountsBatch(
  ctx: AccountOpContext,
  count: number
): Promise<CreateSponsoredAccountsBatchResult> {
  if (count < 1 || count > MAX_ACCOUNTS_PER_BATCH) {
    throw new RangeError(`count must be between 1 and ${MAX_ACCOUNTS_PER_BATCH} (got ${count})`);
  }

  const sponsoredKeypairs = Array.from({ length: count }, () => Keypair.random());
  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());

  let builder = new TransactionBuilder(sponsorAccount, {
    fee: (Number(BASE_FEE) * count * OPS_PER_ACCOUNT).toString(),
    networkPassphrase: ctx.networkPassphrase,
  });

  for (const kp of sponsoredKeypairs) {
    builder = builder
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: kp.publicKey() }))
      .addOperation(Operation.createAccount({ destination: kp.publicKey(), startingBalance: '0' }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: kp.publicKey() }))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: kp.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: ctx.asset, source: kp.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: kp.publicKey() }));
  }

  const tx = builder.setTimeout(100).build();

  tx.sign(ctx.sponsorKeypair);
  for (const kp of sponsoredKeypairs) {
    tx.sign(kp);
  }

  const result = await submitTransaction(ctx.server, tx);

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    accounts: sponsoredKeypairs.map((kp) => ({ publicKey: kp.publicKey(), secretKey: kp.secret() })),
  };
}
