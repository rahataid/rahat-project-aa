import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  CreateSponsoredAccountResult,
  CreateSponsoredAccountsBatchResult,
  MergedAccountItem,
  MergeSponsoredAccountsBatchResult,
  SponsoredAccountBatchItem,
  StellarOperationError,
} from '../types';
import { accountHasTrustline, findTrustlineBalance } from '../utils/account';
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

interface MergePlan {
  publicKey: string;
  status: MergedAccountItem['status'];
  hasTrustline: boolean;
}

/**
 * Loads an account and determines whether it's safe to close out entirely:
 *  - `not-found`: no account at this address — nothing to merge.
 *  - `nonzero-balance`: the account still holds some of the configured asset.
 *    Merging requires the trustline to be closed first, and Stellar refuses
 *    to close a trustline that still holds a balance — so this is reported
 *    rather than silently draining/sweeping the beneficiary's funds.
 *  - `mergeable`: safe to close the trustline (if any) and merge the account.
 *
 * `hasTrustline` tells the caller whether a changeTrust-close op is needed
 * at all — an account that never held this asset's trustline (or already
 * had it closed) can be merged directly.
 *
 * Any non-404 error from loadAccount is rethrown, not swallowed.
 */
export async function planMergeAction(ctx: AccountOpContext, publicKey: string): Promise<MergePlan> {
  let account: Horizon.AccountResponse;
  try {
    account = await ctx.server.loadAccount(publicKey);
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      return { publicKey, status: 'not-found', hasTrustline: false };
    }
    throw error;
  }

  const trustlineBalance = findTrustlineBalance(account, ctx.asset.getCode(), ctx.asset.getIssuer());
  const hasTrustline = trustlineBalance !== undefined;

  if (hasTrustline && trustlineBalance.balance !== '0') {
    return { publicKey, status: 'nonzero-balance', hasTrustline };
  }

  return { publicKey, status: 'mergeable', hasTrustline };
}

/**
 * Stellar caps a transaction at 100 operations and 20 signatures. Each
 * merged account needs at most 2 operations (close trustline + accountMerge)
 * and its own signature (accountMerge/changeTrust are sourced by the account
 * being closed, so it must co-sign) — plus the sponsor's signature for the
 * fee. Signatures are the binding constraint: 19 accounts + 1 sponsor = 20.
 */
export const MAX_ACCOUNTS_PER_MERGE_BATCH = 19;

/**
 * Closes out up to MAX_ACCOUNTS_PER_MERGE_BATCH accounts entirely: closes
 * their trustline for the configured asset (if open) and merges the account
 * into the sponsor, sweeping any remaining native balance back to the
 * sponsor and deleting the account from the ledger. This is the one-way-door
 * counterpart to `createSponsoredAccountsBatch` — use it when a beneficiary
 * is done for good, not when reassigning them between projects (that needs
 * to keep the same account/address alive; this function is the wrong tool
 * for that — it would delete the account).
 *
 * Unlike create, this needs each beneficiary's own keypair (not just their
 * public key) — `accountMerge` and the trustline-close `changeTrust` are
 * both sourced by the account being closed, so it must co-sign; the sponsor
 * only pays the fee. No native XLM balance is required on the beneficiary's
 * side: deleting a ledger entry (or the account itself) always releases
 * whatever reserve was backing it, sponsored or not — that's what makes
 * this work at 0 XLM, where a plain sponsor-side revoke would instead fail
 * (revoking hands the reserve requirement to the account being revoked,
 * which needs a balance to cover it; deletion has no such requirement).
 *
 * Each keypair is inspected first via {@link planMergeAction}: accounts that
 * don't exist are skipped (`not-found`); accounts that still hold a nonzero
 * balance of the configured asset are skipped (`nonzero-balance`) rather
 * than having their trustline force-closed — closing a trustline with an
 * open balance is rejected by Stellar anyway, but this avoids sending an op
 * that would fail the whole batch, and surfaces which beneficiaries still
 * need their balance handled before they can be closed out.
 */
export async function mergeSponsoredAccountsBatch(
  ctx: AccountOpContext,
  keypairs: Keypair[]
): Promise<MergeSponsoredAccountsBatchResult> {
  if (keypairs.length < 1 || keypairs.length > MAX_ACCOUNTS_PER_MERGE_BATCH) {
    throw new RangeError(
      `keypairs.length must be between 1 and ${MAX_ACCOUNTS_PER_MERGE_BATCH} (got ${keypairs.length})`
    );
  }

  const plans = await Promise.all(
    keypairs.map(async (kp) => ({ kp, ...(await planMergeAction(ctx, kp.publicKey())) }))
  );

  const accounts: MergedAccountItem[] = plans.map((p) => ({ publicKey: p.publicKey, status: p.status }));

  const active = plans.filter((p) => p.status === 'mergeable');
  if (active.length === 0) {
    return { hash: null, successful: true, accounts };
  }

  const sponsorAccount = await ctx.server.loadAccount(ctx.sponsorKeypair.publicKey());
  const totalOps = active.reduce((sum, p) => sum + (p.hasTrustline ? 1 : 0) + 1, 0);

  let builder = new TransactionBuilder(sponsorAccount, {
    fee: (Number(BASE_FEE) * totalOps).toString(),
    networkPassphrase: ctx.networkPassphrase,
  });

  for (const { kp, hasTrustline } of active) {
    if (hasTrustline) {
      builder = builder.addOperation(Operation.changeTrust({ asset: ctx.asset, limit: '0', source: kp.publicKey() }));
    }
    builder = builder.addOperation(
      Operation.accountMerge({ destination: ctx.sponsorKeypair.publicKey(), source: kp.publicKey() })
    );
  }

  const tx = builder.setTimeout(100).build();

  tx.sign(ctx.sponsorKeypair);
  for (const { kp } of active) {
    tx.sign(kp);
  }

  const result = await submitTransaction(ctx.server, tx);

  if (result.successful === false) {
    throw new StellarOperationError('Stellar reported the merge batch transaction as unsuccessful', { raw: result });
  }

  return {
    hash: result.hash,
    successful: result.successful,
    ledger: result.ledger,
    accounts,
  };
}