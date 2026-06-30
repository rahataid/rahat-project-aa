import { Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { AccountOpContext, createSponsoredAccountsBatch, MAX_ACCOUNTS_PER_BATCH } from './account';

describe('createSponsoredAccountsBatch', () => {
  const ctx: AccountOpContext = {
    server: {} as unknown as Horizon.Server,
    networkPassphrase: Networks.TESTNET,
    sponsorKeypair: Keypair.random(),
    asset: new Asset('RAHAT', 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG'),
  };

  it('rejects an empty keypairs array', async () => {
    await expect(createSponsoredAccountsBatch(ctx, [])).rejects.toThrow(RangeError);
  });

  it('rejects a keypairs array exceeding MAX_ACCOUNTS_PER_BATCH', async () => {
    const keypairs = Array.from({ length: MAX_ACCOUNTS_PER_BATCH + 1 }, () => Keypair.random());
    await expect(createSponsoredAccountsBatch(ctx, keypairs)).rejects.toThrow(RangeError);
  });
});
