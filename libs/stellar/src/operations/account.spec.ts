import { Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { AccountOpContext, createSponsoredAccountsBatch, MAX_ACCOUNTS_PER_BATCH } from './account';

describe('createSponsoredAccountsBatch', () => {
  const ctx: AccountOpContext = {
    server: {} as unknown as Horizon.Server,
    networkPassphrase: Networks.TESTNET,
    sponsorKeypair: Keypair.random(),
    asset: new Asset('RAHAT', 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG'),
  };

  it('rejects a count below 1', async () => {
    await expect(createSponsoredAccountsBatch(ctx, 0)).rejects.toThrow(RangeError);
  });

  it('rejects a count above MAX_ACCOUNTS_PER_BATCH', async () => {
    await expect(createSponsoredAccountsBatch(ctx, MAX_ACCOUNTS_PER_BATCH + 1)).rejects.toThrow(RangeError);
  });
});
