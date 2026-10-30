import { Horizon, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { StellarOperationError } from '../types';

const LOOKUP_INTERVAL_MS = 5_000;
/** Cap on waiting for a lagging Horizon, so a stalled one cannot hold the caller's queue forever. */
const MAX_LOOKUP_WAIT_SECONDS = 300;

/** Close time (unix seconds) of the newest ledger Horizon has ingested. */
async function latestIngestedLedgerTime(server: Horizon.Server): Promise<number> {
  const { records } = await server.ledgers().order('desc').limit(1).call();
  return Date.parse(records[0].closed_at) / 1000;
}

/**
 * Polls Horizon for the tx hash after a submit timed out (504). Horizon can lag ingesting a tx
 * that did land, so "not found" is only final once Horizon has ingested a ledger closed after
 * the tx's maxTime: past that point the tx can no longer land. Null = it never landed, or Horizon
 * stayed behind for MAX_LOOKUP_WAIT_SECONDS. A tx without maxTime gets a single lookup.
 */
async function findLandedTransaction(
  server: Horizon.Server,
  tx: Transaction | FeeBumpTransaction
): Promise<Horizon.HorizonApi.SubmitTransactionResponse | null> {
  const hash = tx.hash().toString('hex');
  const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
  const maxTime = Number(inner.timeBounds?.maxTime ?? 0);
  // ponytail: giving up at the cap means "unknown", reported as failed. Sponsorship retries are safe
  // (an account that landed late is skipped as already sponsored); a payment retry could double-pay.
  const giveUpAtMs = Date.now() + MAX_LOOKUP_WAIT_SECONDS * 1000;

  for (;;) {
    // Read ingestion progress before the lookup: if Horizon was already past maxTime when the
    // lookup ran and still had no such tx, the tx never landed.
    const ingestedPastExpiry = maxTime
      ? await latestIngestedLedgerTime(server).then((t) => t > maxTime).catch(() => false)
      : true;
    try {
      const found = await server.transactions().transaction(hash).call();
      return found as unknown as Horizon.HorizonApi.SubmitTransactionResponse;
    } catch {
      // not ingested (yet), or Horizon hiccup
    }
    if (ingestedPastExpiry || Date.now() + LOOKUP_INTERVAL_MS > giveUpAtMs) return null;
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
