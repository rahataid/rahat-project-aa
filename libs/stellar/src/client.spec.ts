import { Keypair } from '@stellar/stellar-sdk';
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
});
