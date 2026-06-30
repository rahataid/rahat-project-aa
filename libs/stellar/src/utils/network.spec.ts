import { Networks } from '@stellar/stellar-sdk';
import { resolveNetwork } from './network';

describe('resolveNetwork', () => {
  const baseConfig = {
    sponsorSecret: 'SCNQ7VKHBFCNULMQE6XGTL7G2J3IZBR3VKLVRA5HMOXVTVZG7DLOJEKL',
    assetCode: 'RAHAT',
    assetIssuer: 'GAVSXFHUI5YWS3YI2RFQV7SB3KKVFERKWWY2QSVJNDTROKQZRWEPXLWG',
  };

  it('resolves testnet horizon URL and passphrase', () => {
    const resolved = resolveNetwork({ ...baseConfig, network: 'testnet' });

    expect(resolved.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(resolved.networkPassphrase).toBe(Networks.TESTNET);
  });

  it('resolves mainnet horizon URL and passphrase', () => {
    const resolved = resolveNetwork({ ...baseConfig, network: 'mainnet' });

    expect(resolved.horizonUrl).toBe('https://horizon.stellar.org');
    expect(resolved.networkPassphrase).toBe(Networks.PUBLIC);
  });

  it('respects a horizonUrl override', () => {
    const resolved = resolveNetwork({
      ...baseConfig,
      network: 'testnet',
      horizonUrl: 'https://custom-horizon.example.com',
    });

    expect(resolved.horizonUrl).toBe('https://custom-horizon.example.com');
    expect(resolved.networkPassphrase).toBe(Networks.TESTNET);
  });
});
