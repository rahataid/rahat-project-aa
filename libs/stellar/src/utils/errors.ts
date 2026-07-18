import { Asset } from '@stellar/stellar-sdk';
import { StellarOperationError } from '../types';

function describeAsset(asset: Asset): string {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
}

const PAYMENT_ERROR_MESSAGES: Record<string, (assetDescription: string) => string> = {
  op_no_trust: (asset) =>
    `Destination account does not have a trustline for ${asset}. The receiver must establish a trustline for this asset before they can receive it.`,
  op_no_destination: () =>
    `Destination account does not exist on the network. It must be created and funded with a minimum XLM balance before it can receive payments.`,
  op_src_no_trust: (asset) => `Sender account does not have a trustline for ${asset}.`,
  op_underfunded: (asset) => `Sender account does not have enough ${asset} to complete this payment.`,
  op_not_authorized: (asset) => `Destination account is not authorized to hold ${asset} (the issuer has not approved it).`,
  op_src_not_authorized: (asset) => `Sender account is not authorized to send ${asset}.`,
  op_line_full: (asset) => `Destination account's trustline for ${asset} is full and cannot accept this amount.`,
  op_no_issuer: (asset) => `The issuer account for ${asset} does not exist.`,
};

/**
 * Rewrites a StellarOperationError from submitTransaction into a
 * human-readable message when the Horizon result code identifies a known
 * payment failure (e.g. a missing trustline), while preserving the original
 * resultCodes/raw/cause for callers that want to inspect them. Falls through
 * unchanged for unrecognized errors.
 */
export function describePaymentError(error: unknown, asset: Asset): unknown {
  if (error instanceof StellarOperationError) {
    const code = (error.resultCodes as { operations?: string[] } | undefined)?.operations?.find(
      (c) => c in PAYMENT_ERROR_MESSAGES
    );
    if (code) {
      return new StellarOperationError(PAYMENT_ERROR_MESSAGES[code](describeAsset(asset)), {
        resultCodes: error.resultCodes,
        raw: error.raw,
        cause: error,
      });
    }
  }
  return error;
}
