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
