import { Account, Keypair } from '@stellar/stellar-sdk';
import { StellarClient } from './client';

describe('StellarClient', () => {
  const sponsorKeypair = Keypair.random();
  const assetCode = 'RAHAT';
  const assetIssuer = 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG';

  it('derives the sponsor public key from the configured secret', () => {
    const client = new StellarClient({
      network: 'testnet',
      sponsorSecret: sponsorKeypair.secret(),
      assetCode,
      assetIssuer,
    });

    expect(client.sponsorPublicKey).toBe(sponsorKeypair.publicKey());
  });

  it('builds the configured asset', () => {
    const client = new StellarClient({
      network: 'testnet',
      sponsorSecret: sponsorKeypair.secret(),
      assetCode,
      assetIssuer,
    });

    expect(client.asset.getCode()).toBe(assetCode);
    expect(client.asset.getIssuer()).toBe(assetIssuer);
  });

  it('resolves network details based on config', () => {
    const client = new StellarClient({
      network: 'mainnet',
      sponsorSecret: sponsorKeypair.secret(),
      assetCode,
      assetIssuer,
    });

    expect(client.horizonUrl).toBe('https://horizon.stellar.org');
  });

  it('delegates sendFromSponsoredBatch to the batched payment operation', async () => {
    const client = new StellarClient({
      network: 'testnet',
      sponsorSecret: sponsorKeypair.secret(),
      assetCode,
      assetIssuer,
    });

    const beneficiary = Keypair.random();
    const account = new Account(sponsorKeypair.publicKey(), '1');
    client.server.loadAccount = jest.fn().mockResolvedValue(account);
    client.server.submitTransaction = jest
      .fn()
      .mockResolvedValue({ hash: 'batch123', successful: true, ledger: 7 });
    client.server.operations = jest.fn().mockReturnValue({
      forTransaction: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({ records: [{ id: '900', type: 'payment', from: beneficiary.publicKey() }] }),
    });

    const result = await client.sendFromSponsoredBatch([
      { secret: beneficiary.secret(), destination: Keypair.random().publicKey(), amount: '5' },
    ]);

    expect(result.hash).toBe('batch123');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourcePublicKey).toBe(beneficiary.publicKey());
    expect(result.items[0].paymentId).toBe('900');
  });
});
