import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { CreateSponsoredAccountResult, CreateSponsoredAccountsBatchResult, SponsoredAccountBatchItem, StellarOperationError } from '../types';
import { accountHasTrustline } from '../utils/account';
import { submitTransaction } from './submit';

export type AccountAction = 'create' | 'trustline-only' | 'already-sponsored';

/**
 * Loads an account and classifies what sponsorship work (if any) it still
 * needs:
 *  - `create`: no account at this address yet — needs the full
 *    createAccount + trustline flow.
 *  - `trustline-only`: the account exists (e.g. it was sponsored under a
 *    different project/asset already) but has no trustline for this asset —
 *    only the trustline needs to be added.
 *  - `already-sponsored`: the account exists and already holds a trustline
 *    for this asset — nothing to do.
 *
 * Any non-404 error from loadAccount (network error, rate limit, etc.) is
 * rethrown so the caller can surface/log it rather than silently treating
 * the account as needing full creation.
 */
export async function planAccountAction(ctx: AccountOpContext, publicKey: string): Promise<AccountAction> {
  let account: Horizon.AccountResponse;
  try {
    account = await ctx.server.loadAccount(publicKey);
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      return 'create';
    }
    throw error;
  }

  return accountHasTrustline(account, ctx.asset.getCode(), ctx.asset.getIssuer()) ? 'already-sponsored' : 'trustline-only';
}

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

const OPS_PER_TRUSTLINE_ONLY = 3;

/**
 * Creates up to MAX_ACCOUNTS_PER_BATCH sponsored accounts (with trustlines)
 * in a single transaction. Pass the keypairs for the accounts to sponsor —
 * derive them from existing secrets via Keypair.fromSecret(secret).
 *
 * Each keypair is inspected first: a brand-new account gets the full
 * create-account + trustline flow; an account that already exists (e.g. it
 * was sponsored under a different project/asset) only gets the trustline
 * added; an account that already holds a trustline for this asset is left
 * alone entirely. This avoids the previous behavior where an "already
 * sponsored" account silently failed the whole batch and no trustline was
 * ever created for it.
 */
export async function createSponsoredAccountsBatch(
  ctx: AccountOpContext,
  keypairs: Keypair[]
): Promise<CreateSponsoredAccountsBatchResult> {
  if (keypairs.length < 1 || keypairs.length > MAX_ACCOUNTS_PER_BATCH) {
    throw new RangeError(
      `keypairs.length must be between 1 and ${MAX_ACCOUNTS_PER_BATCH} (got ${keypairs.length})`
    );
  }

  const plans = await Promise.all(
    keypairs.map(async (kp) => ({ kp, action: await planAccountAction(ctx, kp.publicKey()) }))
  );

  const accounts: SponsoredAccountBatchItem[] = plans.map(({ kp, action }) => ({
    publicKey: kp.publicKey(),
    secretKey: kp.secret(),
    action,
  }));

  const active = plans.filter((p) => p.action !== 'already-sponsored');
  if (active.length === 0) {
    return { hash: null, successful: true, accounts };
  }

  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());
  const totalOps = active.reduce(
    (sum, p) => sum + (p.action === 'create' ? OPS_PER_ACCOUNT : OPS_PER_TRUSTLINE_ONLY),
    0
  );

  let builder = new TransactionBuilder(sponsorAccount, {
    fee: (Number(BASE_FEE) * totalOps).toString(),
    networkPassphrase: ctx.networkPassphrase,
  });

  for (const { kp, action } of active) {
    if (action === 'create') {
      builder = builder
        .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: kp.publicKey() }))
        .addOperation(Operation.createAccount({ destination: kp.publicKey(), startingBalance: '0' }))
        .addOperation(Operation.endSponsoringFutureReserves({ source: kp.publicKey() }));
    }
    builder = builder
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: kp.publicKey() }))
      .addOperation(Operation.changeTrust({ asset: ctx.asset, source: kp.publicKey() }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: kp.publicKey() }));
  }

  const tx = builder.setTimeout(100).build();

  tx.sign(ctx.sponsorKeypair);
  for (const { kp } of active) {
    tx.sign(kp);
  }

  const result = await submitTransaction(ctx.server, tx);

  if (result.successful === false) {
    throw new StellarOperationError('Stellar reported the sponsorship batch transaction as unsuccessful', {
      raw: result,
    });
  }

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    accounts,
  };
}
