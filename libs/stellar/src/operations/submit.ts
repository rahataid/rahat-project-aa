import { Horizon, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { StellarOperationError } from '../types';

/**
 * Submits a transaction to Horizon and wraps any failure in a
 * StellarOperationError, surfacing the `result_codes` Horizon returns so
 * callers can make retry decisions without re-parsing the raw error.
 */
export async function submitTransaction(
  server: Horizon.Server,
  tx: Transaction | FeeBumpTransaction
): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
  try {
    return await server.submitTransaction(tx);
  } catch (error) {
    // No result_codes (e.g. 504/timeout) = outcome unknown: the tx may have landed anyway.
    // Resubmitting a new tx could double-pay, so look the (deterministic) hash up first.
    if (!(error as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response?.data?.extras?.result_codes) {
      try {
        const found = await server.transactions().transaction(tx.hash().toString('hex')).call();
        return found as unknown as Horizon.HorizonApi.SubmitTransactionResponse;
      } catch {
        // Not found. This does NOT prove the tx failed: it may still be pending and valid until
        // its timebound expires. Callers that retry must account for a late landing (double-pay).
      }
    }
    const response = (error as { response?: { data?: { extras?: { result_codes?: unknown }; [key: string]: unknown } } })
      ?.response;
    const resultCodes = response?.data?.extras?.result_codes;
    const raw = response?.data;
    const message = error instanceof Error ? error.message : 'unknown error';

    throw new StellarOperationError(
      resultCodes
        ? `Stellar transaction submission failed: ${JSON.stringify(resultCodes)}`
        : `Stellar transaction submission failed: ${message}`,
      { resultCodes, raw, cause: error }
    );
  }
}
