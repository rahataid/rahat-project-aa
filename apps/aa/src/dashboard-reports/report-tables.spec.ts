import * as XLSX from 'xlsx-js-style';
import {
  buildExcel,
  buildPdf,
  DashboardStats,
  formatGeneratedAt,
  reportHasData,
} from './report-file.builder';
import { buildReportTables } from './report-tables';
import { DASHBOARD_REPORT_DEFINITIONS } from './report.config';

const definition = (id: string) => {
  const found = DASHBOARD_REPORT_DEFINITIONS.find((item) => item.id === id);
  if (!found) throw new Error(`Missing report definition: ${id}`);
  return found;
};

const emptyStats = (): DashboardStats => ({
  benefStats: [],
  triggeersStats: [],
  tokenStats: {},
});

describe('buildReportTables', () => {
  it('exports project overview as phase rows with totals', () => {
    const stats: DashboardStats = {
      ...emptyStats(),
      triggeersStats: [
        {
          name: 'ACTIVITIES_11111111-1111-1111-1111-111111111111',
          data: [
            {
              phase: { name: 'PREPAREDNESS' },
              totalActivities: 10,
              totalCompletedActivities: 4,
              completedPercentage: 40,
            },
            {
              phase: { name: 'RESPONSE' },
              totalActivities: 20,
              totalCompletedActivities: 15,
              completedPercentage: 75,
            },
          ],
        },
      ],
    };

    const tables = buildReportTables(definition('overview'), stats, {
      projectId: '11111111-1111-1111-1111-111111111111',
    });

    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toEqual([
      'Phase',
      'Total Activities',
      'Completed Activities',
      'Completion %',
    ]);
    expect(tables[0].rows).toEqual([
      ['Preparedness', 10, 4, 40],
      ['Response', 20, 15, 75],
      ['TOTAL', 30, 19, 63.3],
    ]);
  });

  it('exports activity overview as summary, phase and category tables', async () => {
    const stats: DashboardStats = {
      ...emptyStats(),
      activities: [
        {
          status: 'COMPLETED',
          phase: { name: 'PREPAREDNESS' },
          category: { name: 'Awareness' },
          isAutomated: true,
          activityCommunication: [{ id: 1 }],
        },
        {
          status: 'NOT_STARTED',
          phase: { name: 'PREPAREDNESS' },
          category: { name: 'Awareness' },
        },
        {
          status: 'DELAYED',
          phase: 'RESPONSE',
          category: 'Relief',
        },
      ],
    };

    const report = definition('activity-overview');
    expect(reportHasData(report, emptyStats())).toBe(false);
    expect(reportHasData(report, stats)).toBe(true);

    const tables = buildReportTables(report, stats);
    expect(tables.map((table) => table.title)).toEqual([
      'Summary',
      'Activity Status by Phase',
      'Activity Status by Category',
    ]);
    expect(tables[0].rows).toEqual([
      ['Total Activities', 3],
      ['Completed', 1],
      ['In Progress', 0],
      ['Not Started', 1],
      ['Delayed', 1],
      ['Automated', 1],
      ['Manual', 2],
      ['With Communication', 1],
    ]);
    expect(tables[1].columns).toEqual([
      'Phase',
      'Completed',
      'In Progress',
      'Not Started',
      'Delayed',
      'Total',
    ]);
    expect(tables[1].rows[0]).toEqual(['Preparedness', 1, 0, 1, 0, 2]);
    expect(tables[1].rows.at(-1)).toEqual(['TOTAL', 1, 0, 1, 1, 3]);
    expect(tables[2].rows[0]).toEqual(['Awareness', 1, 0, 1, 0, 2]);
    expect(tables[2].rows.at(-1)).toEqual(['TOTAL', 1, 0, 1, 1, 3]);

    const workbook = XLSX.read(buildExcel('Activity Overview', 'Flood 2026', tables), {
      type: 'buffer',
    });
    expect(workbook.SheetNames).toEqual(['Report']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Report, {
      header: 1,
    }) as unknown[][];
    expect(rows.some((row) => row[0] === 'Activity Status by Phase')).toBe(true);
    expect(rows.some((row) => row[0] === 'Activity Status by Category')).toBe(
      true,
    );
    expect(
      Buffer.isBuffer(await buildPdf('Activity Overview', 'Flood 2026', tables)),
    ).toBe(true);
  });

  it('keeps flood series separate and includes denominators', () => {
    const stats: DashboardStats = {
      ...emptyStats(),
      benefStats: [
        {
          name: 'FLOOD26_POPULATION_BY_GENDER',
          data: {
            total: 100,
            answered: 98,
            buckets: [
              { id: 'MALE', count: 50 },
              { id: 'GENDER_AND_SEXUAL_MINORITY', count: 2 },
            ],
          },
        },
        {
          name: 'FLOOD26_POPULATION_BY_AGE_GENDER',
          data: {
            total: 100,
            answered: 90,
            categories: ['0-2', '2-5'],
            series: [
              { name: 'MALE', data: [4, 5] },
              { name: 'FEMALE', data: [3, 6] },
            ],
          },
        },
      ],
    };

    const tables = buildReportTables(definition('flood26Demographics'), stats);

    expect(tables).toHaveLength(1);
    expect(tables[0].columns).toEqual([
      'Chart',
      'Category / Response',
      'Series',
      'Count',
      'Total',
      'Answered',
      'Multi',
    ]);
    expect(tables[0].rows).toEqual([
      ['Population by gender', 'Male', '', 50, 100, 98, 'No'],
      ['Population by age and gender', '0–2 yrs', 'Male', 4, 100, 90, 'No'],
      ['Population by age and gender', '2–5 yrs', 'Male', 5, 100, 90, 'No'],
      ['Population by age and gender', '0–2 yrs', 'Female', 3, 100, 90, 'No'],
      ['Population by age and gender', '2–5 yrs', 'Female', 6, 100, 90, 'No'],
    ]);
  });

  it('renders unavailable communication metrics as N/A', () => {
    const tables = buildReportTables(
      definition('communication-outreach'),
      emptyStats(),
      { projectId: 'abc' },
    );

    expect(tables[0].columns).toEqual(['Metric', 'Value']);
    expect(tables[1].columns).toEqual(['Audience', 'Metric', 'Value']);
    expect(tables[1].rows).toContainEqual([
      'Beneficiaries',
      'Unique AVC Recipients',
      'N/A',
    ]);
  });
});

describe('report file builders', () => {
  const tables = [
    {
      title: 'Activities Status',
      columns: ['Phase', 'Total Activities', 'Completed Activities', 'Completion %'],
      rows: [['Preparedness', 10, 4, 40]],
    },
  ];

  it('formats the generated timestamp in long form', () => {
    expect(formatGeneratedAt(new Date('2026-11-05T08:37:34Z'))).toMatch(
      /^November 5, 2026 at \d{1,2}:\d{2}:\d{2} [AP]M$/,
    );
  });

  it('writes every table into one sheet with its own bold header', () => {
    const multiTable = [
      ...tables,
      {
        title: 'Summary',
        columns: ['Metric', 'Value'],
        rows: [['Households', 120]],
      },
    ];
    const buffer = buildExcel('Project Overview', 'Flood 2026', multiTable);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Report']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Report, {
      header: 1,
    }) as unknown[][];
    expect(rows.some((row) => row[0] === 'Activities Status')).toBe(true);
    expect(rows.some((row) => row[0] === 'Summary')).toBe(true);
    expect(rows.some((row) => row[0] === 'Metric' && row[1] === 'Value')).toBe(
      true,
    );
  });

  it('writes a PDF containing all tables', async () => {
    const buffer = await buildPdf('Project Overview', 'Flood 2026', tables);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
