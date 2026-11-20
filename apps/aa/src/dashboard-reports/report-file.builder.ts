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

export type ReportCell = string | number;

export type ReportTable = {
  /** Optional block heading, used as the Excel sheet name and PDF subheading. */
  title?: string;
  columns: string[];
  rows: ReportCell[][];
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

const excelColumnWidth = (tables: ReportTable[], column: number): number => {
  const values = tables.flatMap((table) => [
    table.columns[column] ?? '',
    ...table.rows.map((row) => row[column] ?? ''),
  ]);
  const longest = Math.max(...values.map((value) => String(value).length));
  return Math.min(60, Math.max(12, longest + 2));
};

export const buildExcel = (
  title: string,
  projectName: string,
  inputTables: ReportTable[],
): Buffer => {
  const tables = inputTables.length
    ? inputTables
    : [{ columns: ['Result'], rows: [['No data available for this report.']] }];
  const maxColumns = Math.max(...tables.map((table) => table.columns.length));

  // One worksheet with clearly separated blocks: some spreadsheet viewers
  // only open the first sheet, so multi-sheet workbooks hid every table but
  // the first one for those users.
  const data: any[][] = [
    [title],
    ['Project', projectName || '-'],
    ['Generated', formatGeneratedAt()],
    [],
  ];
  const headerRows: Array<{ row: number; columns: number }> = [];

  tables.forEach((table) => {
    if (table.title) data.push([table.title]);
    headerRows.push({ row: data.length, columns: table.columns.length });
    data.push(table.columns);
    table.rows.forEach((row) =>
      data.push(table.columns.map((_, column) => row[column] ?? '')),
    );
    data.push([]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(data);
  headerRows.forEach(({ row, columns }) => {
    for (let column = 0; column < columns; column++) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (sheet[address]) sheet[address].s = { font: { bold: true } };
    }
  });
  sheet['!cols'] = Array.from({ length: maxColumns }, (_, column) => ({
    wch: excelColumnWidth(tables, column),
  }));
  sheet['!merges'] = [
    {
      s: { r: 0, c: 0 },
      e: { r: 0, c: Math.max(maxColumns - 1, 0) },
    },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const buildPdf = (
  title: string,
  projectName: string,
  inputTables: ReportTable[],
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
    const headerHeight = 24;
    const rowPadding = 7;
    const tableGap = 24;

    const tables = inputTables.length
      ? inputTables
      : [{ columns: ['Result'], rows: [['No data available for this report.']] }];

    const widthsFor = (table: ReportTable): number[] => {
      const raw = table.columns.map((header, column) => {
        const longest = Math.max(
          String(header ?? '').length,
          ...table.rows.map((row) => String(row[column] ?? '').length),
        );
        return Math.min(pageWidth * 0.42, Math.max(50, longest * 4.2 + 14));
      });
      const scale = pageWidth / raw.reduce((sum, width) => sum + width, 0);
      const widths = raw.map((width) => Math.max(42, Math.round(width * scale)));
      widths[widths.length - 1] +=
        pageWidth - widths.reduce((sum, width) => sum + width, 0);
      return widths;
    };

    const drawTableTitle = (y: number, table: ReportTable) => {
      if (!table.title) return y;
      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(table.title, margin, y, { width: pageWidth });
      return y + 16;
    };

    const drawHeader = (
      y: number,
      table: ReportTable,
      widths: number[],
    ): number => {
      doc.rect(margin, y, pageWidth, headerHeight).fill('#E9EEF5');
      doc.fillColor('#1F2937').font('Helvetica-Bold').fontSize(8.5);
      let x = margin + 5;
      table.columns.forEach((label, column) => {
        doc.text(String(label), x, y + 6, {
          width: widths[column] - 10,
          height: headerHeight - 8,
          ellipsis: true,
        });
        x += widths[column];
      });
      return y + headerHeight;
    };

    const drawTitle = () => {
      doc
        .fillColor('#111827')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(title, margin, margin, { width: pageWidth });
      doc
        .fillColor('#4B5563')
        .font('Helvetica')
        .fontSize(9)
        .text(`Project: ${projectName || '-'}`, margin, margin + 24)
        .text(`Generated: ${formatGeneratedAt()}`, margin, margin + 37);
    };

    const drawTable = (startY: number, table: ReportTable): number => {
      const widths = widthsFor(table);
      let y = drawTableTitle(startY, table);
      y = drawHeader(y, table, widths);

      if (!table.rows.length) {
        doc.fillColor('#6B7280').font('Helvetica').fontSize(9);
        doc.text('No data available for this table.', margin, y + 10);
        return y + 30;
      }

      table.rows.forEach((row, index) => {
        doc.font('Helvetica').fontSize(8);
        const heights = widths.map((width, column) =>
          doc.heightOfString(String(row[column] ?? ''), {
            width: width - 10,
          }),
        );
        const height = Math.max(...heights, 10) + rowPadding;

        if (y + height > doc.page.height - margin - 20) {
          doc.addPage();
          y = drawTableTitle(margin, table);
          y = drawHeader(y, table, widths);
          doc.fillColor('#1F2937').font('Helvetica').fontSize(8);
        }

        if (index % 2 === 1) {
          doc.rect(margin, y, pageWidth, height).fill('#F7F9FC');
        }

        doc.fillColor('#1F2937').font('Helvetica').fontSize(8);
        let x = margin + 5;
        widths.forEach((width, column) => {
          doc.text(String(row[column] ?? ''), x, y + rowPadding / 2, {
            width: width - 10,
          });
          x += width;
        });
        y += height;
      });

      return y + tableGap;
    };

    try {
      drawTitle();
      let y = margin + 62;
      tables.forEach((table) => {
        y = drawTable(y, table);
      });

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
