// Report-specific table shaping. The UI download dialog stays thin: the
// backend decides both which reports exist and how each one is laid out.

import {
  buildReportRows,
  DashboardStats,
  humanize,
  ReportCell,
  ReportTable,
} from './report-file.builder';
import {
  FLOOD_CHART_LABELS,
  ReportDefinition,
  STAT_LABELS,
  VALUE_LABELS,
} from './report.config';

export type BuildReportTablesOptions = {
  projectId?: string;
};

const list = (value: any): any[] => (Array.isArray(value) ? value : []);

const num = (value: any): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const benefData = (stats: DashboardStats, name: string) =>
  stats.benefStats?.find((stat) => stat?.name === name)?.data;

const triggerData = (stats: DashboardStats, name: string) =>
  stats.triggeersStats?.find((stat) => String(stat?.name ?? '').includes(name))
    ?.data;

/** Translate known ids, but never mangle free text such as "Tile / slate". */
const label = (value: unknown): string => {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (VALUE_LABELS[raw]) return VALUE_LABELS[raw];
  const upper = raw.toUpperCase();
  if (VALUE_LABELS[upper]) return VALUE_LABELS[upper];
  const keyLike = raw.includes('_') || /^[a-z0-9]+$/.test(raw);
  return keyLike ? humanize(raw) : raw;
};

const bucketsOf = (data: any): Array<{ id: string; count: number }> => {
  if (Array.isArray(data)) {
    return data.map((item: any) => ({
      id: String(item?.id ?? item?.name ?? ''),
      count: num(item?.count ?? item?.value ?? 0),
    }));
  }
  return list(data?.buckets).map((bucket: any) => ({
    id: String(bucket?.id ?? bucket?.name ?? ''),
    count: num(bucket?.count ?? 0),
  }));
};

const pct = (completed: number, total: number): number =>
  total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;

const makeTable = (
  title: string | undefined,
  columns: string[],
  rows: ReportCell[][],
): ReportTable[] => (rows.length ? [{ title, columns, rows }] : []);

/** Main tab: progress cards are per phase, so export phase-level totals. */
const overviewTables = (
  definition: ReportDefinition,
  stats: DashboardStats,
  projectId?: string,
): ReportTable[] => {
  const prefix = `ACTIVITIES_${projectId?.toUpperCase() ?? ''}`;
  const data = stats.triggeersStats?.find(
    (stat) =>
      String(stat?.name ?? '').startsWith(prefix) && Array.isArray(stat?.data),
  )?.data;
  const items = list(data);
  if (!items.length) {
    return buildReportRows(definition, stats, { projectId }).length
      ? [
          {
            title: 'Activities Status',
            columns: [
              'Phase',
              'Total Activities',
              'Completed Activities',
              'Completion %',
            ],
            rows: [],
          },
        ]
      : [];
  }

  const rows: ReportCell[][] = items.map((item: any) => [
    label(item?.phase?.name ?? item?.name ?? item?.id ?? 'UNKNOWN'),
    num(item?.totalActivities),
    num(item?.totalCompletedActivities),
    num(item?.completedPercentage),
  ]);

  const totals = items.reduce(
    (acc, item) => ({
      total: acc.total + num(item?.totalActivities),
      completed: acc.completed + num(item?.totalCompletedActivities),
    }),
    { total: 0, completed: 0 },
  );
  rows.push([
    'TOTAL',
    totals.total,
    totals.completed,
    pct(totals.completed, totals.total),
  ]);

  return [
    {
      title: 'Activities Status',
      columns: [
        'Phase',
        'Total Activities',
        'Completed Activities',
        'Completion %',
      ],
      rows,
    },
  ];
};

const beneficiaryTables = (stats: DashboardStats): ReportTable[] => {
  const kpis: ReportCell[][] = [
    ['Total Respondents', num(benefData(stats, 'TOTAL_RESPONDENTS')?.count)],
    [
      'Total Number of Family Members',
      num(benefData(stats, 'TOTAL_NUMBER_FAMILY_MEMBERS')?.count),
    ],
  ];

  const fieldMap = benefData(stats, 'FIELD_MAP_RESULT') ?? {};
  const vulnerable: ReportCell[][] = [
    'no_of_pregnant_women',
    'no_of_lactating_women',
    'no_of_persons_with_disability',
  ].map((key) => [label(key), num(fieldMap[key])]);

  return [
    ...makeTable('Summary', ['Metric', 'Count'], kpis),
    ...makeTable(
      'Gender Distribution',
      ['Gender', 'Beneficiaries'],
      bucketsOf(benefData(stats, 'BENEFICIARY_GENDER')).map((bucket) => [
        label(bucket.id),
        bucket.count,
      ]),
    ),
    ...makeTable(
      'Age Groups',
      ['Age Group', 'Beneficiaries'],
      bucketsOf(benefData(stats, 'BENEFICIARY_AGEGROUPS')).map((bucket) => [
        label(bucket.id),
        bucket.count,
      ]),
    ),
    ...makeTable('Vulnerable Groups', ['Group', 'Members'], vulnerable),
    ...makeTable(
      'Social Protection Benefits',
      ['SSA Type', 'Households'],
      bucketsOf(benefData(stats, 'TYPE_OF_SSA')).map((bucket) => [
        label(bucket.id),
        bucket.count,
      ]),
    ),
  ];
};

const floodSurveyTables = (stats: DashboardStats): ReportTable[] => {
  const charts = [
    {
      name: 'FLOOD_AFFECTED_IN_5_YEARS',
      title: 'Flood Impact in Last 5 Years',
      onlyPositive: true,
    },
    {
      name: 'RECEIVE_DISASTER_INFO',
      title: 'Access to Early Warning Information',
      onlyPositive: true,
    },
    {
      name: 'CHANNEL_USAGE_STATS',
      title: 'Information Channels Used',
      onlyPositive: false,
    },
  ];

  const rows: ReportCell[][] = [];
  charts.forEach((chart) => {
    bucketsOf(benefData(stats, chart.name))
      .filter((bucket) => !chart.onlyPositive || bucket.count > 0)
      .forEach((bucket) => {
        rows.push([chart.title, label(bucket.id), bucket.count]);
      });
  });

  return makeTable(
    'Survey Responses',
    ['Survey Question', 'Response / Channel', 'Beneficiaries'],
    rows,
  );
};

const accessTables = (stats: DashboardStats): ReportTable[] => {
  const charts = [
    ['DO_YOU_HAVE_ACCESS_TO_MOBILE_PHONES', 'Access to Mobile Phones'],
    ['DO_YOU_HAVE_ACCESS_TO_INTERNET', 'Access to Internet'],
    ['USE_DIGITAL_WALLETS', 'Digital Wallet Use'],
    ['TYPE_OF_PHONE', 'Types of Phone'],
    ['HAVE_ACTIVE_BANK_AC', 'Bank Account Access'],
    [
      'SSA_RECIPIENT_IN_HH',
      'Social Security Linked to Bank Account',
    ],
  ] as const;

  const rows: ReportCell[][] = [];
  charts.forEach(([name, title]) => {
    bucketsOf(benefData(stats, name)).forEach((bucket) => {
      rows.push([title, label(bucket.id), bucket.count]);
    });
  });

  return [
    ...makeTable(
      'Access & Inclusion',
      ['Access Dimension', 'Response', 'Beneficiaries'],
      rows,
    ),
    ...makeTable(
      'Bank Accounts',
      ['Bank', 'Beneficiaries'],
      bucketsOf(benefData(stats, 'BENEFICIARY_COUNTBYBANK')).map((bucket) => [
        bucket.id,
        bucket.count,
      ]),
    ),
  ];
};

const communicationTables = (
  stats: DashboardStats,
  projectId?: string,
): ReportTable[] => {
  const comms = triggerData(stats, 'COMMS_STATS') ?? {};
  const suffix = projectId?.toUpperCase() ?? '';

  const summary: ReportCell[][] = [
    [
      'Activities with Communication',
      num(triggerData(stats, 'ACTIVITIES_WITH_COMM')?.count),
    ],
    [
      'Activities Automated',
      num(triggerData(stats, 'ACTIVITIES_AUTOMATED')?.count),
    ],
  ];

  const stakeholderMetrics: ReportCell[][] = [
    [
      'Total Communication Sent',
      num(triggerData(stats, `STAKEHOLDERS_${suffix}`)?.sessionCount),
    ],
    [
      'Number of Stakeholders',
      num(benefData(stats, 'STAKEHOLDERS_TOTAL')?.count),
    ],
    ['AVC Successfully Sent', num(comms.stakeholder?.VOICE?.SUCCESS)],
    ['SMS Successfully Sent', num(comms.stakeholder?.SMS?.SUCCESS)],
    ['Delivery Failures', num(comms.stakeholder?.VOICE?.FAIL)],
  ];

  const beneficiaryMetrics: ReportCell[][] = [
    [
      'Total Communication Sent',
      num(triggerData(stats, `BENEFICIARY_${suffix}`)?.sessionCount),
    ],
    ['AVC Successfully Sent', num(comms.beneficiary?.VOICE?.SUCCESS)],
    [
      'SMS Successfully Delivered',
      num(comms.beneficiary?.SMS?.SUCCESS) +
        num(comms.beneficiary?.['Prabhu SMS']?.SUCCESS),
    ],
    [
      'SMS and AVC Delivery Failures',
      num(comms.beneficiary?.VOICE?.FAIL),
    ],
    ['Unique AVC Recipients', 'N/A'],
  ];

  return [
    ...makeTable('Summary', ['Metric', 'Value'], summary),
    ...makeTable(
      'Audience Metrics',
      ['Audience', 'Metric', 'Value'],
      [
        ...stakeholderMetrics.map(
          ([metric, value]): ReportCell[] => ['Stakeholders', metric, value],
        ),
        ...beneficiaryMetrics.map(
          ([metric, value]): ReportCell[] => ['Beneficiaries', metric, value],
        ),
      ],
    ),
  ];
};

const OVERVIEW_STATUS_COLUMNS: Array<[string, string]> = [
  ['COMPLETED', 'Completed'],
  ['WORK_IN_PROGRESS', 'In Progress'],
  ['NOT_STARTED', 'Not Started'],
  ['DELAYED', 'Delayed'],
];

const nameOf = (value: any): string => String(value?.name ?? value ?? '');

const hasItems = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : !!value && typeof value === 'object' && Object.keys(value).length > 0;

/** Mirrors the Activity Overview tab's client-side computeActivityStats. */
const activitiesOverviewTables = (stats: DashboardStats): ReportTable[] => {
  const activities = stats.activities ?? [];
  const statusCounts: Record<string, number> = Object.fromEntries(
    OVERVIEW_STATUS_COLUMNS.map(([status]) => [status, 0]),
  );
  const phaseCounts = new Map<string, Record<string, number>>();
  const categoryCounts = new Map<string, Record<string, number>>();
  let automated = 0;
  let withCommunication = 0;

  for (const activity of activities) {
    const rawStatus = String(activity?.status ?? 'NOT_STARTED');
    const status = OVERVIEW_STATUS_COLUMNS.some(([key]) => key === rawStatus)
      ? rawStatus
      : 'NOT_STARTED';
    statusCounts[status] += 1;

    const phase = nameOf(activity?.phase) || 'UNKNOWN';
    const phaseRow = phaseCounts.get(phase) ?? {};
    phaseRow[status] = (phaseRow[status] ?? 0) + 1;
    phaseCounts.set(phase, phaseRow);

    const category = nameOf(activity?.category) || 'UNKNOWN';
    const categoryRow = categoryCounts.get(category) ?? {};
    categoryRow[status] = (categoryRow[status] ?? 0) + 1;
    categoryCounts.set(category, categoryRow);

    if (activity?.isAutomated) automated += 1;
    if (hasItems(activity?.activityCommunication)) withCommunication += 1;
  }

  const statusHeaders = OVERVIEW_STATUS_COLUMNS.map(([, heading]) => heading);
  const overallStatusCounts = Object.fromEntries(
    OVERVIEW_STATUS_COLUMNS.map(([status]) => [status, statusCounts[status]]),
  );
  const countRow = (name: string, counts: Record<string, number>): ReportCell[] => [
    name,
    ...OVERVIEW_STATUS_COLUMNS.map(([status]) => num(counts[status])),
    Object.values(counts).reduce((sum, count) => sum + count, 0),
  ];

  const summary: ReportCell[][] = [
    ['Total Activities', activities.length],
    ['Completed', statusCounts.COMPLETED],
    ['In Progress', statusCounts.WORK_IN_PROGRESS],
    ['Not Started', statusCounts.NOT_STARTED],
    ['Delayed', statusCounts.DELAYED],
    ['Automated', automated],
    ['Manual', activities.length - automated],
    ['With Communication', withCommunication],
  ];

  const phaseRows: ReportCell[][] = [
    ...[...phaseCounts.entries()].map(([name, counts]) =>
      countRow(label(name), counts),
    ),
    countRow('TOTAL', overallStatusCounts),
  ];

  const categoryRows: ReportCell[][] = [
    ...[...categoryCounts.entries()]
      .map(([name, counts]) => ({
        name,
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .map(({ name, counts }) => countRow(label(name), counts)),
    countRow('TOTAL', overallStatusCounts),
  ];

  return [
    ...makeTable('Summary', ['Metric', 'Value'], summary),
    ...makeTable(
      'Activity Status by Phase',
      ['Phase', ...statusHeaders, 'Total'],
      phaseRows,
    ),
    ...makeTable(
      'Activity Status by Category',
      ['Category', ...statusHeaders, 'Total'],
      categoryRows,
    ),
  ];
};

const flood26Tables = (
  definition: ReportDefinition,
  stats: DashboardStats,
): ReportTable[] => {
  const rows: ReportCell[][] = [];

  definition.selections.forEach((selection) => {
    (selection.names ?? []).forEach((name) => {
      const data = benefData(stats, name);
      if (!data) return;

      const chart =
        FLOOD_CHART_LABELS[name] ?? STAT_LABELS[name] ?? humanize(name);
      const total = num(data.total);
      const answered = num(data.answered);
      const multi = data.multi === true ? 'Yes' : 'No';

      bucketsOf(data).forEach((bucket) => {
        if (bucket.id.toUpperCase() === 'GENDER_AND_SEXUAL_MINORITY') return;
        rows.push([chart, label(bucket.id), '', bucket.count, total, answered, multi]);
      });

      list(data.series).forEach((series: any) => {
        list(series?.data).forEach((value: any, index: number) => {
          rows.push([
            chart,
            label(data.categories?.[index] ?? index + 1),
            label(series?.name),
            num(value),
            total,
            answered,
            multi,
          ]);
        });
      });
    });
  });

  return makeTable(
    'Survey Responses',
    [
      'Chart',
      'Category / Response',
      'Series',
      'Count',
      'Total',
      'Answered',
      'Multi',
    ],
    rows,
  );
};

const genericTables = (
  definition: ReportDefinition,
  stats: DashboardStats,
  options: BuildReportTablesOptions,
): ReportTable[] => {
  const rows = buildReportRows(definition, stats, options);
  return makeTable(
    undefined,
    ['Section', 'Category', 'Value'],
    rows.map((row) => [row.section, row.category, row.value]),
  );
};

/** Backend source of truth for both file formats. */
export const buildReportTables = (
  definition: ReportDefinition,
  stats: DashboardStats,
  options: BuildReportTablesOptions = {},
): ReportTable[] => {
  switch (definition.layout) {
    case 'overview':
      return overviewTables(definition, stats, options.projectId);
    case 'beneficiary':
      return beneficiaryTables(stats);
    case 'floodSurvey':
      return floodSurveyTables(stats);
    case 'access':
      return accessTables(stats);
    case 'communication':
      return communicationTables(stats, options.projectId);
    case 'activitiesOverview':
      return activitiesOverviewTables(stats);
    case 'flood26':
      return flood26Tables(definition, stats);
    default:
      return genericTables(definition, stats, options);
  }
};
