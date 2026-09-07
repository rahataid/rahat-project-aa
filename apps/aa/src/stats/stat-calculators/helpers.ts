import { BeneficiaryExtrasRecord } from './types';

// Counts how many beneficiaries have `field` (in `extras`) equal to one of
// `expected` values, case/whitespace-insensitively. Shared by every
// yes/no-style extras calculator (internet access, bank account, etc).
export function countExtrasFieldValuesNormalized(
  records: BeneficiaryExtrasRecord[],
  field: string,
  expected: string[]
) {
  const counts: Record<string, number> = {};
  for (const key of expected) {
    counts[key] = 0;
  }

  for (const item of records) {
    const rawVal = item.extras?.[field];

    if (typeof rawVal === 'string') {
      const normalized = rawVal.trim().toLowerCase();
      if (expected.includes(normalized)) {
        counts[normalized] += 1;
      }
    }
  }

  return Object.entries(counts).map(([key, count]) => ({
    id: key.charAt(0).toUpperCase() + key.slice(1),
    count,
  }));
}
