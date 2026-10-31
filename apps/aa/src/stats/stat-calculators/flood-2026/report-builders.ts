import { BeneficiaryExtrasRecord } from '../types';

// Shape every FLOOD26_* stat stores in `data`. `total` is every household
// considered, `answered` the ones with a usable value — the dashboard shows
// both so each chart states its denominator. Single-dimension charts use
// `buckets`, cross-tabs use `categories` + `series`.
export interface ReportData {
  total: number;
  answered: number;
  multi?: boolean;
  buckets?: Bucket[];
  categories?: string[];
  series?: { name: string; data: number[] }[];
}

export interface Bucket {
  id: string;
  count: number;
}

type Records = BeneficiaryExtrasRecord[];
type Options = Record<string, string>;
type Dimension = (record: BeneficiaryExtrasRecord) => string[];

export const UNKNOWN = 'UNKNOWN';
// Not "OTHER": free-text answers are often literally "Other" and must stay a
// separate bar from the rolled-up long tail.
export const OTHERS = 'OTHERS';

const raw = (record: BeneficiaryExtrasRecord, field: string) =>
  record?.extras?.[field];

// Trimmed string, or null when missing, blank, non-scalar or "UNKNOWN".
export function text(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === 'object') {
    return null;
  }
  const s = String(value).trim().replace(/\s+/g, ' ');
  return s && s.toUpperCase() !== UNKNOWN ? s : null;
}

export function yesNo(value: unknown): 'YES' | 'NO' | null {
  const s = text(value)?.toLowerCase();
  if (s === 'yes' || s === 'true') return 'YES';
  if (s === 'no' || s === 'false') return 'NO';
  return null;
}

export function count(value: unknown): number | null {
  const s = text(value);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const sum = (buckets: Bucket[]) => buckets.reduce((s, b) => s + b.count, 0);

function withUnknown(
  total: number,
  buckets: Bucket[],
  answered = sum(buckets)
): ReportData | null {
  if (!answered) return null;
  const unknown = total - answered;
  return {
    total,
    answered,
    buckets:
      unknown > 0 ? [...buckets, { id: UNKNOWN, count: unknown }] : buckets,
  };
}

function topN(buckets: Bucket[], max: number): Bucket[] {
  const sorted = [...buckets].sort((a, b) => b.count - a.count);
  if (sorted.length <= max) return sorted;
  return [
    ...sorted.slice(0, max),
    { id: OTHERS, count: sum(sorted.slice(max)) },
  ];
}

const answeredFields = (records: Records, options: Options) =>
  Object.entries(options).filter(([, field]) =>
    records.some((r) => yesNo(raw(r, field)) !== null)
  );

// Free-text grouping: "1 Bigha", "1 bigha " and "1 BIGHA" are one value,
// labelled with the first spelling seen. Shared per field so cross-tab rows
// and single charts agree.
export function category(field: string): Dimension {
  const labels = new Map<string, string>();
  return (record) => {
    const value = text(raw(record, field));
    if (value === null) return [];
    const key = value.toLowerCase();
    if (!labels.has(key)) labels.set(key, value);
    return [labels.get(key)];
  };
}

// The option ids whose Yes/No field is "Yes".
export const yesOptions =
  (options: Options): Dimension =>
  (record) =>
    Object.entries(options)
      .filter(([, field]) => yesNo(raw(record, field)) === 'YES')
      .map(([id]) => id);

export const yesNoOf =
  (field: string): Dimension =>
  (record) =>
    [yesNo(raw(record, field)) ?? UNKNOWN];

export function categorical(
  records: Records,
  field: string,
  max = 15
): ReportData | null {
  const of = category(field);
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const label of of(record)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const buckets = [...counts].map(([id, c]) => ({ id, count: c }));
  return withUnknown(records.length, topN(buckets, max));
}

export function yesNoStat(records: Records, field: string): ReportData | null {
  const buckets = [
    { id: 'YES', count: 0 },
    { id: 'NO', count: 0 },
  ];
  for (const record of records) {
    const v = yesNo(raw(record, field));
    if (v) buckets[v === 'YES' ? 0 : 1].count++;
  }
  return withUnknown(records.length, buckets);
}

// Multi-select flags (one Yes/No field per option). A household counts as
// answered if any option has a Yes/No; options nobody answered are dropped.
export function multiSelect(
  records: Records,
  options: Options
): ReportData | null {
  const present = answeredFields(records, options);
  const buckets = present.map(([id]) => ({ id, count: 0 }));
  let answered = 0;
  for (const record of records) {
    let any = false;
    present.forEach(([, field], i) => {
      const v = yesNo(raw(record, field));
      if (v) any = true;
      if (v === 'YES') buckets[i].count++;
    });
    if (any) answered++;
  }
  const data = withUnknown(
    records.length,
    buckets.sort((a, b) => b.count - a.count),
    answered
  );
  return data && { ...data, multi: true };
}

// Several independent Yes/No questions side by side: one category per
// question, series Yes / No / Unknown.
export function yesNoGroup(
  records: Records,
  options: Options
): ReportData | null {
  const present = answeredFields(records, options);
  if (!present.length) return null;
  const answered = records.filter((r) =>
    present.some(([, field]) => yesNo(raw(r, field)) !== null)
  ).length;
  const series = ['YES', 'NO', UNKNOWN].map((name) => ({
    name,
    data: present.map(
      ([, field]) =>
        records.filter((r) => (yesNo(raw(r, field)) ?? UNKNOWN) === name).length
    ),
  }));
  return {
    total: records.length,
    answered,
    categories: present.map(([id]) => id),
    series,
  };
}

// Sums numeric-string fields across households, e.g. members by gender.
export function sums(records: Records, options: Options): ReportData | null {
  let answered = 0;
  const buckets = Object.keys(options).map((id) => ({ id, count: 0 }));
  for (const record of records) {
    let any = false;
    Object.values(options).forEach((field, i) => {
      const n = count(raw(record, field));
      if (n !== null) {
        any = true;
        buckets[i].count += n;
      }
    });
    if (any) answered++;
  }
  return answered ? { total: records.length, answered, buckets } : null;
}

// Rows x columns household counts. A household lands in every row/column it
// matches (multi-select dimensions), and is skipped if it has no row or no
// column. Rows past `maxRows` roll into OTHERS.
// ponytail: columns are uncapped; fine for the closed sets used here (hazards,
// damage types, roof types), cap them if a free-text column dimension is added.
export function crossTab(
  records: Records,
  rowsOf: Dimension,
  colsOf: Dimension,
  maxRows = 10
): ReportData | null {
  const table = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const cols = new Set<string>();
  let answered = 0;

  for (const record of records) {
    const rows = rowsOf(record);
    const cs = colsOf(record);
    if (!rows.length || !cs.length) continue;
    answered++;
    for (const row of rows) {
      rowTotals.set(row, (rowTotals.get(row) ?? 0) + 1);
      const cells = table.get(row) ?? new Map<string, number>();
      table.set(row, cells);
      for (const c of cs) {
        cols.add(c);
        cells.set(c, (cells.get(c) ?? 0) + 1);
      }
    }
  }
  // Only Unknown columns means the column field was never answered.
  if (!answered || [...cols].every((c) => c === UNKNOWN)) return null;

  const ranked = [...rowTotals.keys()].sort(
    (a, b) => rowTotals.get(b) - rowTotals.get(a)
  );
  const top = ranked.slice(0, maxRows);
  const rest = ranked.slice(maxRows);
  const cell = (row: string, col: string) =>
    row === OTHERS
      ? rest.reduce((s, r) => s + (table.get(r).get(col) ?? 0), 0)
      : table.get(row).get(col) ?? 0;
  const categories = rest.length ? [...top, OTHERS] : top;

  return {
    total: records.length,
    answered,
    categories,
    series: [...cols].map((name) => ({
      name,
      data: categories.map((row) => cell(row, name)),
    })),
  };
}
