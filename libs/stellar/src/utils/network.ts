import { Horizon, Networks } from '@stellar/stellar-sdk';
import { StellarClientConfig, StellarNetwork } from '../types';

export interface ResolvedNetwork {
  horizonUrl: string;
  networkPassphrase: string;
  server: Horizon.Server;
}

//TODO: make horizon urls configurable
const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
};

export function resolveNetwork(config: StellarClientConfig): ResolvedNetwork {
  const horizonUrl = config.horizonUrl ?? HORIZON_URLS[config.network];

  return {
    horizonUrl,
    networkPassphrase: NETWORK_PASSPHRASES[config.network],
    server: new Horizon.Server(horizonUrl),
  };
}
