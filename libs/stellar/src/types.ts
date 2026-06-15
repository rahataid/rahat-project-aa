export type StellarNetwork = 'testnet' | 'mainnet';

export interface StellarClientConfig {
  network: StellarNetwork;
  /** Overrides the default Horizon URL for the selected network */
  horizonUrl?: string;
  /** Secret key of the sponsor/distributor account that pays fees and reserves */
  sponsorSecret: string;
  /** Asset code of the asset operated on, e.g. 'RAHAT' */
  assetCode: string;
  /** Public key of the account that issued the asset */
  assetIssuer: string;
}

export interface SponsoredAccount {
  publicKey: string;
  secretKey: string;
}

export interface TransactionResult {
  hash: string;
  successful?: boolean;
  ledger?: number;
}

export interface CreateSponsoredAccountResult extends TransactionResult {
  account: SponsoredAccount;
}

export interface CreateSponsoredAccountsBatchResult extends TransactionResult {
  accounts: SponsoredAccount[];
}

export type PaymentResult = TransactionResult;

export interface StellarOperationErrorOptions {
  resultCodes?: unknown;
  raw?: unknown;
  cause?: unknown;
}

/**
 * Thrown when a transaction is rejected by Horizon. `resultCodes` and `raw`
 * carry the Horizon error response so callers (e.g. queue processors) can
 * make retry decisions without re-parsing the original error.
 */
export class StellarOperationError extends Error {
  readonly resultCodes?: unknown;
  readonly raw?: unknown;

  constructor(message: string, options?: StellarOperationErrorOptions) {
    super(message);
    this.name = 'StellarOperationError';
    this.resultCodes = options?.resultCodes;
    this.raw = options?.raw;
    if (options?.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
