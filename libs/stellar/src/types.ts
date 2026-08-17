import { Asset, Horizon, Keypair } from '@stellar/stellar-sdk';

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

export interface SponsoredAccountBatchItem extends SponsoredAccount {
  /** What the batch call did for this account: created it + trustline, added only the trustline (account already existed), or found it already fully sponsored. */
  action: 'create' | 'trustline-only' | 'already-sponsored';
}

export interface CreateSponsoredAccountsBatchResult {
  /** Null when every account in the batch was already fully sponsored — nothing was submitted. */
  hash: string | null;
  successful?: boolean;
  ledger?: number;
  accounts: SponsoredAccountBatchItem[];
}

export interface MergedAccountItem {
  publicKey: string;
  /**
   * `mergeable`: account was closed out (trustline closed if present, account merged into the sponsor).
   * `not-found`: no account exists at this address — nothing to merge.
   * `nonzero-balance`: account still holds some of the configured asset — skipped rather than force-closing a funded trustline.
   */
  status: 'mergeable' | 'not-found' | 'nonzero-balance';
}

export interface MergeSponsoredAccountsBatchResult {
  /** Null when nothing in the batch was mergeable — no transaction was submitted. */
  hash: string | null;
  successful?: boolean;
  ledger?: number;
  accounts: MergedAccountItem[];
}

export type PaymentResult = TransactionResult;

/** One leg of a batched sponsored payment: the beneficiary's own secret authorizes their transfer. */
export interface SponsoredBatchTransferItem {
  secret: string;
  destination: string;
  amount: string;
}

export interface SendFromSponsoredBatchResult extends TransactionResult {
  /** All items share the single transaction hash above; paymentId is the Horizon operation ID for that item's own payment operation within it. */
  items: { sourcePublicKey: string; destination: string; amount: string; paymentId: string }[];
}

/** Context for sponsor-mediated payment operations (sendToSponsored, sendFromSponsored). */
export interface PaymentOpContext {
  server: Horizon.Server;
  networkPassphrase: string;
  sponsorKeypair: Keypair;
  asset: Asset;
}

/** Context for a plain, non-sponsored send (sendPayment) — no sponsor keypair or fixed asset needed. */
export interface SendPaymentContext {
  server: Horizon.Server;
  networkPassphrase: string;
}

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
