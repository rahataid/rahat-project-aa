// Pure builders: dashboard stats -> readable rows -> Excel/PDF buffers.
// No NestJS or database dependencies here so the output logic stays testable.

import * as XLSX from 'xlsx-js-style';
import { ReportDefinition, STAT_LABELS } from './report.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');

export type ReportRow = {
  section: string;
  category: string;
  value: string | number;
};

export type BucketOptions = {
  hideZeroBuckets?: boolean;
  hiddenIds?: string[];
};

export type BuildReportRowsOptions = {
  /** Routed project id, used to scope ACTIVITIES_* and communication stats. */
  projectId?: string;
};

export interface ReportFile {
  filename: string;
  mimeType: string;
  base64: string;
}

export type DashboardStats = {
  benefStats: any[];
  triggeersStats: any[];
  tokenStats: Record<string, any>;
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** "ACTIVITIES_WITH_COMM_<uuid>" -> "ACTIVITIES_WITH_COMM" */
export const cleanStatName = (name: string) =>
  String(name ?? '')
    .replace(UUID_RE, '')
    .replace(/[_-]+$/g, '')
    .trim()
    .toUpperCase();

/** Turn a raw stat/bucket key into a human label, using the map when possible. */
export const humanize = (raw: unknown): string => {
  const text = String(raw ?? '')
    .replace(UUID_RE, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const key = text.replace(/\s/g, '_').toUpperCase();
  if (STAT_LABELS[key]) return STAT_LABELS[key];

  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const asNumber = (value: any): number | string => {
  const num = Number(value);
  return Number.isFinite(num) ? num : String(value ?? '');
};

const isFloodStat = (data: any) =>
  !!data &&
  typeof data === 'object' &&
  (Array.isArray(data.buckets) || Array.isArray(data.series));

const addFloodRows = (
  section: string,
  data: any,
  rows: ReportRow[],
  options: BucketOptions = {},
) => {
  const before = rows.length;
  const hidden = (options.hiddenIds ?? []).map((id) => id.toUpperCase());

  (data.buckets ?? []).forEach((bucket: any) => {
    const id = bucket?.id ?? bucket?.name;
    if (options.hideZeroBuckets && Number(bucket?.count ?? 0) <= 0) return;
    if (hidden.includes(String(id ?? '').toUpperCase())) return;
    rows.push({
      section,
      category: humanize(id),
      value: asNumber(bucket?.count ?? 0),
    });
  });

  (data.series ?? []).forEach((series: any) => {
    (series?.data ?? []).forEach((value: any, index: number) => {
      const category = data.categories?.[index] ?? index + 1;
      rows.push({
        section,
        category: `${humanize(series?.name)} / ${humanize(category)}`,
        value: asNumber(value),
      });
    });
  });

  if (rows.length === before) {
    rows.push({
      section,
      category: 'Answered',
      value: asNumber(data.answered ?? 0),
    });
  }
};

/** Recursively flatten nested objects so a cell never contains "[object Object]". */
const addObjectRows = (
  section: string,
  object: Record<string, any>,
  prefix: string,
  rows: ReportRow[],
  options: BucketOptions = {},
) => {
  Object.entries(object).forEach(([key, value]) => {
    const category = prefix ? `${prefix} / ${humanize(key)}` : humanize(key);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (isFloodStat(value)) addFloodRows(section, value, rows, options);
      else addObjectRows(section, value, category, rows, options);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          addObjectRows(section, item, `${category} ${index + 1}`, rows, options);
        } else {
          rows.push({
            section,
            category: `${category} ${index + 1}`,
            value: asNumber(item),
          });
        }
      });
      return;
    }

    rows.push({ section, category, value: asNumber(value) });
  });
};

const addStatRows = (
  section: string,
  data: any,
  rows: ReportRow[],
  options: BucketOptions = {},
) => {
  if (data === null || data === undefined) return;

  if (isFloodStat(data)) {
    addFloodRows(section, data, rows, options);
    return;
  }

  if (Array.isArray(data)) {
    data.forEach((item: any, index) => {
      if (item && typeof item === 'object') {
        const raw =
          item.id ??
          item.name ??
          item.label ??
          item.category ??
          item.phase?.name ??
          `Item ${index + 1}`;
        const count =
          item.count ??
          item.value ??
          item.completedPercentage ??
          item.total;
        if (count === undefined) {
          addObjectRows(section, item, humanize(raw), rows, options);
        } else {
          rows.push({
            section,
            category: humanize(raw),
            value: asNumber(count),
          });
        }
        return;
      }
      rows.push({
        section,
        category: `Item ${index + 1}`,
        value: asNumber(item),
      });
    });
    return;
  }

  if (typeof data === 'object') {
    addObjectRows(section, data, '', rows, options);
    return;
  }

  rows.push({ section, category: 'Total', value: asNumber(data) });
};

/** Flood-2026 charts are only rendered by the UI when `answered` is present. */
const floodStatHasData = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  const hasBuckets = Array.isArray(data.buckets) && data.buckets.length > 0;
  const hasSeries = Array.isArray(data.series) && data.series.length > 0;
  return (hasBuckets || hasSeries) && Number(data.answered ?? 0) > 0;
};

export const reportHasData = (
  definition: ReportDefinition,
  stats: DashboardStats,
  options: BuildReportRowsOptions = {},
): boolean =>
  definition.selections.some((selection) => {
    if (selection.source === 'tokenStats') {
      return Object.values(stats.tokenStats ?? {}).some(
        (value) => value !== null && value !== undefined && value !== '',
      );
    }
    const source =
      selection.source === 'benefStats'
        ? stats.benefStats
        : stats.triggeersStats;
    return (source ?? []).some((stat: any) => {
      if (!stat?.name) return false;
      if (selection.names && !selection.names.includes(stat.name)) return false;
      if (selection.prefixes) {
        if (selection.prefixes.includes('ACTIVITIES_') && options.projectId) {
          if (
            !stat.name.startsWith(`ACTIVITIES_${options.projectId.toUpperCase()}`)
          ) {
            return false;
          }
        } else if (
          !selection.prefixes.some((prefix) => stat.name.startsWith(prefix))
        ) {
          return false;
        }
      }
      if (definition.requiresFlood2026) return floodStatHasData(stat.data);
      return stat.data !== null && stat.data !== undefined;
    });
  });

const tokenRows = (stats: DashboardStats): ReportRow[] =>
  [
    'assignedTokens',
    'disbursedTokens',
    'pendingDisbursement',
    'redeemedTokens',
  ].map((key) => ({
    section: 'Token Stats',
    category: humanize(key),
    value: asNumber(stats.tokenStats?.[key] ?? 0),
  }));

/** Mirrors the dashboard's CommunicationAnalytics view model. */
const communicationRows = (
  stats: DashboardStats,
  projectId?: string,
): ReportRow[] => {
  const triggerData = (name: string) =>
    stats.triggeersStats?.find((item) => item?.name?.includes(name))?.data;

  const activitiesWithComm = Number(
    triggerData('ACTIVITIES_WITH_COMM')?.count ?? 0,
  );
  const activitiesAutomated = Number(
    triggerData('ACTIVITIES_AUTOMATED')?.count ?? 0,
  );
  const commsStats = triggerData('COMMS_STATS') ?? {};
  const stakeholders = commsStats.stakeholder ?? {};
  const beneficiaries = commsStats.beneficiary ?? {};
  const suffix = projectId?.toUpperCase() ?? '';
  const stakeholderSessions = Number(
    triggerData(`STAKEHOLDERS_${suffix}`)?.sessionCount ?? 0,
  );
  const beneficiarySessions = Number(
    triggerData(`BENEFICIARY_${suffix}`)?.sessionCount ?? 0,
  );
  const totalStakeholders = Number(
    stats.benefStats?.find((stat) => stat?.name === 'STAKEHOLDERS_TOTAL')?.data
      ?.count ?? 0,
  );

  const rows: ReportRow[] = [
    {
      section: 'Activities with Communication',
      category: 'Total',
      value: activitiesWithComm,
    },
    {
      section: 'Activities Automated',
      category: 'Total',
      value: activitiesAutomated,
    },
  ];

  const addGroup = (
    group: string,
    total: number,
    metrics: Array<[string, string | number]>,
  ) => {
    rows.push({
      section: `${group} / Total Communication Sent`,
      category: 'Total Communication Sent',
      value: total,
    });
    metrics.forEach(([category, value]) =>
      rows.push({ section: group, category, value }),
    );
  };

  addGroup('Stakeholders', stakeholderSessions, [
    ['Number of Stakeholders', totalStakeholders],
    ['AVC Successfully Sent', Number(stakeholders?.VOICE?.SUCCESS ?? 0)],
    ['SMS Successfully Sent', Number(stakeholders?.SMS?.SUCCESS ?? 0)],
    ['Delivery Failures', Number(stakeholders?.VOICE?.FAIL ?? 0)],
  ]);
  addGroup('Beneficiaries', beneficiarySessions, [
    ['AVC Successfully Sent', Number(beneficiaries?.VOICE?.SUCCESS ?? 0)],
    [
      'SMS Successfully Delivered',
      Number(beneficiaries?.SMS?.SUCCESS ?? 0) +
        Number(beneficiaries?.['Prabhu SMS']?.SUCCESS ?? 0),
    ],
    ['SMS and AVC Delivery Failures', Number(beneficiaries?.VOICE?.FAIL ?? 0)],
    ['Unique AVC Recipients', 0],
  ]);

  return rows;
};

/** Section label shown in the file, keyed off the backend report id. */
const sectionName = (definition: ReportDefinition, stat: any): string => {
  if (definition.id === 'overview') {
    return STAT_LABELS.ACTIVITIES_STATUS ?? 'Activities Status';
  }
  return STAT_LABELS[cleanStatName(stat.name)] ?? humanize(stat.name);
};

export const buildReportRows = (
  definition: ReportDefinition,
  stats: DashboardStats,
  options: BuildReportRowsOptions = {},
): ReportRow[] => {
  if (definition.id === 'token-stats') return tokenRows(stats);
  if (definition.id === 'communication-outreach') {
    return communicationRows(stats, options.projectId);
  }

  const rows: ReportRow[] = [];

  definition.selections.forEach((selection) => {
    if (selection.source === 'tokenStats') return;

    const source =
      selection.source === 'benefStats'
        ? stats.benefStats
        : stats.triggeersStats;

    (source ?? []).forEach((stat: any) => {
      if (!stat?.name) return;
      if (selection.names && !selection.names.includes(stat.name)) return;
      if (selection.prefixes) {
        // The dashboard main tab only shows ACTIVITIES_<current project id>.
        if (selection.prefixes.includes('ACTIVITIES_') && options.projectId) {
          if (
            !stat.name.startsWith(`ACTIVITIES_${options.projectId.toUpperCase()}`)
          ) {
            return;
          }
        } else if (
          !selection.prefixes.some((prefix) => stat.name.startsWith(prefix))
        ) {
          return;
        }
      }
      if (definition.requiresFlood2026 && !floodStatHasData(stat.data)) return;

      const bucketOptions: BucketOptions =
        definition.id === 'flood-survey-data'
          ? { hideZeroBuckets: true }
          : definition.requiresFlood2026
            ? { hiddenIds: ['GENDER_AND_SEXUAL_MINORITY'] }
            : {};

      addStatRows(sectionName(definition, stat), stat.data, rows, bucketOptions);
    });
  });

  return rows;
};

/** e.g. "November 5, 2026 at 2:07:34 PM" in the server's local timezone. */
export const formatGeneratedAt = (date = new Date()): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);

const safeFilename = (value: string) =>
  value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

export const toReportFile = (
  buffer: Buffer,
  title: string,
  extension: 'xlsx' | 'pdf',
): ReportFile => ({
  filename: `${safeFilename(title)}-${new Date().toISOString().slice(0, 10)}.${extension}`,
  mimeType:
    extension === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf',
  base64: buffer.toString('base64'),
});

export const buildExcel = (
  title: string,
  projectName: string,
  rows: ReportRow[],
): Buffer => {
  const headerRow = ['Section', 'Category', 'Value'];
  const data: any[][] = [
    [title],
    ['Project', projectName || '-'],
    ['Generated', formatGeneratedAt()],
    [],
    headerRow,
    ...rows.map((row) => [row.section, row.category, row.value]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  headerRow.forEach((_, column) => {
    const address = XLSX.utils.encode_cell({ r: 4, c: column });
    if (sheet[address]) sheet[address].s = { font: { bold: true } };
  });
  sheet['!cols'] = [{ wch: 36 }, { wch: 42 }, { wch: 16 }];
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const buildPdf = (
  title: string,
  projectName: string,
  rows: ReportRow[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
      info: { Title: title },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 40;
    const pageWidth = doc.page.width - margin * 2;
    const columns = [
      { key: 'section' as const, width: Math.round(pageWidth * 0.36) },
      { key: 'category' as const, width: Math.round(pageWidth * 0.42) },
      { key: 'value' as const, width: Math.round(pageWidth * 0.22) },
    ];
    const textWidth = (index: number) => columns[index].width - 10;
    const headerHeight = 26;
    const rowPadding = 8;

    const drawHeader = (y: number) => {
      doc.rect(margin, y, pageWidth, headerHeight).fill('#E9EEF5');
      doc.fillColor('#1F2937').font('Helvetica-Bold').fontSize(9);
      let x = margin + 5;
      ['Section', 'Category', 'Value'].forEach((label, index) => {
        doc.text(label, x, y + 8, { width: textWidth(index) });
        x += columns[index].width;
      });
      return y + headerHeight;
    };

    const drawTitle = () => {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(title, margin, margin);
      doc
        .fillColor('#4B5563')
        .font('Helvetica')
        .fontSize(9)
        .text(`Project: ${projectName || '-'}`, margin, margin + 24)
        .text(`Generated: ${formatGeneratedAt()}`, margin, margin + 37);
    };

    try {
      drawTitle();
      let y = margin + 62;
      y = drawHeader(y);

      doc.font('Helvetica').fontSize(8);
      rows.forEach((row, index) => {
        const heights = columns.map((column, columnIndex) =>
          doc.heightOfString(String(row[column.key] ?? ''), {
            width: textWidth(columnIndex),
          }),
        );
        const height = Math.max(...heights, 10) + rowPadding;

        if (y + height > doc.page.height - margin - 20) {
          doc.addPage();
          y = drawHeader(margin);
          doc.fillColor('#111827').font('Helvetica').fontSize(8);
        }

        if (index % 2 === 1) {
          doc.rect(margin, y, pageWidth, height).fill('#F7F9FC');
        }

        doc.fillColor('#1F2937').font('Helvetica').fontSize(8);
        let x = margin + 5;
        columns.forEach((column, columnIndex) => {
          doc.text(String(row[column.key] ?? ''), x, y + rowPadding / 2, {
            width: textWidth(columnIndex),
          });
          x += column.width;
        });
        y += height;
      });

      if (!rows.length) {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(9);
        doc.text('No data available for this report.', margin, y + 12);
      }

      const range = doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        doc.switchToPage(page);
        doc.fillColor('#9CA3AF').font('Helvetica').fontSize(7);
        doc.text(
          `Page ${page + 1} of ${range.count}`,
          margin,
          doc.page.height - margin - 12,
          { width: pageWidth, align: 'right' },
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
