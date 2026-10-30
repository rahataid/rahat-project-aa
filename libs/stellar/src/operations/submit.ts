import { Horizon, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { StellarOperationError } from '../types';

const LOOKUP_INTERVAL_MS = 5_000;
/** Ledger close plus Horizon ingestion lag after maxTime, before "not found" is final. */
const LOOKUP_GRACE_SECONDS = 15;

/**
 * Polls Horizon for the tx hash until the tx can no longer land (its maxTime has passed), since
 * Horizon can time out the submit (504) and lag ingesting a tx that did land. Null = it never
 * landed. A tx without maxTime could land at any point, so it gets a single lookup.
 */
async function findLandedTransaction(
  server: Horizon.Server,
  tx: Transaction | FeeBumpTransaction
): Promise<Horizon.HorizonApi.SubmitTransactionResponse | null> {
  const hash = tx.hash().toString('hex');
  const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
  const maxTime = Number(inner.timeBounds?.maxTime ?? 0);
  const deadlineMs = maxTime ? (maxTime + LOOKUP_GRACE_SECONDS) * 1000 : 0;

  for (;;) {
    try {
      const found = await server.transactions().transaction(hash).call();
      return found as unknown as Horizon.HorizonApi.SubmitTransactionResponse;
    } catch {
      // not ingested (yet), or Horizon hiccup: keep polling until the deadline
    }
    if (Date.now() + LOOKUP_INTERVAL_MS > deadlineMs) return null;
    await new Promise((resolve) => setTimeout(resolve, LOOKUP_INTERVAL_MS));
  }
}

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
      const found = await findLandedTransaction(server, tx).catch(() => null);
      if (found) return found;
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
