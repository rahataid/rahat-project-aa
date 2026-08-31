import { Account, Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import {
  AccountOpContext,
  createSponsoredAccountsBatch,
  MAX_ACCOUNTS_PER_BATCH,
  MAX_ACCOUNTS_PER_MERGE_BATCH,
  mergeSponsoredAccountsBatch,
  planAccountAction,
  planMergeAction,
} from './account';

const asset = new Asset('RAHAT', 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG');
const sponsorKeypair = Keypair.random();

function makeCtx(server: Partial<Horizon.Server>): AccountOpContext {
  return {
    server: server as unknown as Horizon.Server,
    networkPassphrase: Networks.TESTNET,
    sponsorKeypair,
    asset,
  };
}

function accountWithBalances(
  publicKey: string,
  balances: { asset_code?: string; asset_issuer?: string; sponsor?: string; balance?: string }[] = [],
  accountSponsor?: string
) {
  const normalized = balances.map((b) => ({ balance: '0', ...b }));
  return Object.assign(new Account(publicKey, '1'), { balances: normalized, sponsor: accountSponsor });
}

const notFound = Object.assign(new Error('Not Found'), { response: { status: 404 } });

describe('planAccountAction', () => {
  it('returns "create" when the account does not exist (404)', async () => {
    const ctx = makeCtx({ loadAccount: jest.fn().mockRejectedValue(notFound) });
    await expect(planAccountAction(ctx, Keypair.random().publicKey())).resolves.toBe('create');
  });

  it('returns "trustline-only" when the account exists without a matching trustline', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({ loadAccount: jest.fn().mockResolvedValue(accountWithBalances(pk, [])) });
    await expect(planAccountAction(ctx, pk)).resolves.toBe('trustline-only');
  });

  it('returns "already-sponsored" when the account already holds the matching trustline', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({
      loadAccount: jest
        .fn()
        .mockResolvedValue(accountWithBalances(pk, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer() }])),
    });
    await expect(planAccountAction(ctx, pk)).resolves.toBe('already-sponsored');
  });

  it('treats a trustline for a different asset as not sponsored', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({
      loadAccount: jest
        .fn()
        .mockResolvedValue(accountWithBalances(pk, [{ asset_code: 'OTHER', asset_issuer: 'GOTHERISSUER' }])),
    });
    await expect(planAccountAction(ctx, pk)).resolves.toBe('trustline-only');
  });

  it('rethrows non-404 errors instead of treating them as "create"', async () => {
    const serverError = Object.assign(new Error('Service unavailable'), { response: { status: 503 } });
    const ctx = makeCtx({ loadAccount: jest.fn().mockRejectedValue(serverError) });
    await expect(planAccountAction(ctx, Keypair.random().publicKey())).rejects.toThrow('Service unavailable');
  });
});

describe('createSponsoredAccountsBatch', () => {
  const ctx: AccountOpContext = {
    server: {} as unknown as Horizon.Server,
    networkPassphrase: Networks.TESTNET,
    sponsorKeypair: Keypair.random(),
    asset,
  };

  it('rejects an empty keypairs array', async () => {
    await expect(createSponsoredAccountsBatch(ctx, [])).rejects.toThrow(RangeError);
  });

  it('rejects a keypairs array exceeding MAX_ACCOUNTS_PER_BATCH', async () => {
    const keypairs = Array.from({ length: MAX_ACCOUNTS_PER_BATCH + 1 }, () => Keypair.random());
    await expect(createSponsoredAccountsBatch(ctx, keypairs)).rejects.toThrow(RangeError);
  });

  it('skips accounts that are already sponsored and submits nothing when every account is already sponsored', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn();
    const runCtx = makeCtx({
      loadAccount: jest
        .fn()
        .mockResolvedValue(accountWithBalances(kp.publicKey(), [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer() }])),
      submitTransaction,
    });

    const result = await createSponsoredAccountsBatch(runCtx, [kp]);

    expect(result.hash).toBeNull();
    expect(result.accounts).toEqual([{ publicKey: kp.publicKey(), secretKey: kp.secret(), action: 'already-sponsored' }]);
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it('creates a trustline-only transaction for an account that exists but lacks the trustline', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: true, ledger: 7 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      return Promise.resolve(accountWithBalances(publicKey, []));
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    const result = await createSponsoredAccountsBatch(runCtx, [kp]);

    expect(result.hash).toBe('txhash');
    expect(result.accounts).toEqual([{ publicKey: kp.publicKey(), secretKey: kp.secret(), action: 'trustline-only' }]);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('handles a mixed batch of new, trustline-only, and already-sponsored accounts in one call', async () => {
    const newKp = Keypair.random();
    const trustlineOnlyKp = Keypair.random();
    const sponsoredKp = Keypair.random();

    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: true, ledger: 9 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      if (publicKey === newKp.publicKey()) return Promise.reject(notFound);
      if (publicKey === trustlineOnlyKp.publicKey()) return Promise.resolve(accountWithBalances(publicKey, []));
      if (publicKey === sponsoredKp.publicKey())
        return Promise.resolve(accountWithBalances(publicKey, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer() }]));
      throw new Error(`unexpected publicKey ${publicKey}`);
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    const result = await createSponsoredAccountsBatch(runCtx, [newKp, trustlineOnlyKp, sponsoredKp]);

    expect(result.hash).toBe('txhash');
    expect(result.accounts.map((a) => a.action)).toEqual(['create', 'trustline-only', 'already-sponsored']);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws when Horizon reports the submitted transaction as unsuccessful', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: false, ledger: 9 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      return Promise.reject(notFound);
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    await expect(createSponsoredAccountsBatch(runCtx, [kp])).rejects.toMatchObject({ name: 'StellarOperationError' });
  });
});

describe('planMergeAction', () => {
  it('returns "not-found" when the account does not exist (404)', async () => {
    const ctx = makeCtx({ loadAccount: jest.fn().mockRejectedValue(notFound) });
    await expect(planMergeAction(ctx, Keypair.random().publicKey())).resolves.toMatchObject({
      status: 'not-found',
      hasTrustline: false,
    });
  });

  it('returns "mergeable" with hasTrustline false when the account never held the trustline', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({ loadAccount: jest.fn().mockResolvedValue(accountWithBalances(pk, [])) });
    await expect(planMergeAction(ctx, pk)).resolves.toMatchObject({ status: 'mergeable', hasTrustline: false });
  });

  it('returns "mergeable" with hasTrustline true when the trustline balance is zero', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(accountWithBalances(pk, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer(), balance: '0' }])),
    });
    await expect(planMergeAction(ctx, pk)).resolves.toMatchObject({ status: 'mergeable', hasTrustline: true });
  });

  it('returns "nonzero-balance" when the trustline still holds funds', async () => {
    const pk = Keypair.random().publicKey();
    const ctx = makeCtx({
      loadAccount: jest.fn().mockResolvedValue(accountWithBalances(pk, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer(), balance: '42' }])),
    });
    await expect(planMergeAction(ctx, pk)).resolves.toMatchObject({ status: 'nonzero-balance', hasTrustline: true });
  });

  it('rethrows non-404 errors instead of treating them as not-found', async () => {
    const serverError = Object.assign(new Error('Service unavailable'), { response: { status: 503 } });
    const ctx = makeCtx({ loadAccount: jest.fn().mockRejectedValue(serverError) });
    await expect(planMergeAction(ctx, Keypair.random().publicKey())).rejects.toThrow('Service unavailable');
  });
});

describe('mergeSponsoredAccountsBatch', () => {
  const ctx: AccountOpContext = {
    server: {} as unknown as Horizon.Server,
    networkPassphrase: Networks.TESTNET,
    sponsorKeypair: Keypair.random(),
    asset,
  };

  it('rejects an empty keypairs array', async () => {
    await expect(mergeSponsoredAccountsBatch(ctx, [])).rejects.toThrow(RangeError);
  });

  it('rejects a keypairs array exceeding MAX_ACCOUNTS_PER_MERGE_BATCH', async () => {
    const keypairs = Array.from({ length: MAX_ACCOUNTS_PER_MERGE_BATCH + 1 }, () => Keypair.random());
    await expect(mergeSponsoredAccountsBatch(ctx, keypairs)).rejects.toThrow(RangeError);
  });

  it('submits nothing when the only account in the batch does not exist', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn();
    const runCtx = makeCtx({ loadAccount: jest.fn().mockRejectedValue(notFound), submitTransaction });

    const result = await mergeSponsoredAccountsBatch(runCtx, [kp]);

    expect(result.hash).toBeNull();
    expect(result.accounts).toEqual([{ publicKey: kp.publicKey(), status: 'not-found' }]);
    expect(submitTransaction).not.toHaveBeenCalled();
  });

  it('closes the trustline and merges the account in one transaction, signed by both sponsor and beneficiary', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: true, ledger: 3 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      return Promise.resolve(accountWithBalances(publicKey, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer(), balance: '0' }]));
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    const result = await mergeSponsoredAccountsBatch(runCtx, [kp]);

    expect(result.hash).toBe('txhash');
    expect(result.accounts).toEqual([{ publicKey: kp.publicKey(), status: 'mergeable' }]);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
    const submittedTx = submitTransaction.mock.calls[0][0];
    expect(submittedTx.operations.map((op: { type: string }) => op.type)).toEqual(['changeTrust', 'accountMerge']);
    expect(submittedTx.signatures.length).toBe(2);
  });

  it('merges directly without a changeTrust op when the account never held the trustline', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: true, ledger: 3 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      return Promise.resolve(accountWithBalances(publicKey, []));
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    await mergeSponsoredAccountsBatch(runCtx, [kp]);

    const submittedTx = submitTransaction.mock.calls[0][0];
    expect(submittedTx.operations.map((op: { type: string }) => op.type)).toEqual(['accountMerge']);
  });

  it('skips an account with a nonzero trustline balance instead of force-closing it, within a mixed batch', async () => {
    const mergeableKp = Keypair.random();
    const fundedKp = Keypair.random();
    const notFoundKp = Keypair.random();

    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: true, ledger: 4 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      if (publicKey === mergeableKp.publicKey()) return Promise.resolve(accountWithBalances(publicKey, []));
      if (publicKey === fundedKp.publicKey())
        return Promise.resolve(accountWithBalances(publicKey, [{ asset_code: 'RAHAT', asset_issuer: asset.getIssuer(), balance: '10' }]));
      if (publicKey === notFoundKp.publicKey()) return Promise.reject(notFound);
      throw new Error(`unexpected publicKey ${publicKey}`);
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    const result = await mergeSponsoredAccountsBatch(runCtx, [mergeableKp, fundedKp, notFoundKp]);

    expect(result.hash).toBe('txhash');
    expect(result.accounts.map((a) => a.status)).toEqual(['mergeable', 'nonzero-balance', 'not-found']);
    expect(submitTransaction).toHaveBeenCalledTimes(1);
    const submittedTx = submitTransaction.mock.calls[0][0];
    expect(submittedTx.operations).toHaveLength(1);
    expect(submittedTx.signatures.length).toBe(2);
  });

  it('throws when Horizon reports the submitted transaction as unsuccessful', async () => {
    const kp = Keypair.random();
    const submitTransaction = jest.fn().mockResolvedValue({ hash: 'txhash', successful: false, ledger: 5 });
    const loadAccount = jest.fn().mockImplementation((publicKey: string) => {
      if (publicKey === sponsorKeypair.publicKey()) return Promise.resolve(new Account(publicKey, '5'));
      return Promise.resolve(accountWithBalances(publicKey, []));
    });
    const runCtx = makeCtx({ loadAccount, submitTransaction });

    await expect(mergeSponsoredAccountsBatch(runCtx, [kp])).rejects.toMatchObject({ name: 'StellarOperationError' });
  });
});
