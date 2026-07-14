/**
 * Defines which fields to strip from each settings key before exposing via the
 * public listSettings / getSettings API.
 *
 * Add a new entry here whenever a settings key stores credentials or any value
 * that should never leave the server. The key matches the settings `name` column
 * exactly (case-sensitive). The array contains the field names inside `value`
 * that will be deleted before the response is sent.
 */
export const SENSITIVE_SETTINGS_FIELDS: Record<string, string[]> = {
  // Stellar sponsor wallet — strip private signing key and any alternate field
  // names that different versions of the settings payload may use.
  STELLAR_SPONSOR_SETTINGS: ['sponsorSecret', 'sponsorPublicKey'],

  // EVM / general chain settings — strip operator private key if present.
  CHAIN_SETTINGS: ['privateKey'],
};

/**
 * Removes sensitive fields from a single settings record's `value` object.
 * Returns a new object; the original is not mutated.
 */
export function sanitizeSettingValue(name: string, value: unknown): unknown {
  const fields = SENSITIVE_SETTINGS_FIELDS[name];
  if (!fields || !value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([k]) => !fields.includes(k))
  );
}
