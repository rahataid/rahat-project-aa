import { Account, Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { AccountOpContext, createSponsoredAccountsBatch, MAX_ACCOUNTS_PER_BATCH, planAccountAction } from './account';

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

function accountWithBalances(publicKey: string, balances: { asset_code?: string; asset_issuer?: string }[] = []) {
  return Object.assign(new Account(publicKey, '1'), { balances });
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
