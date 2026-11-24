// Report-specific table shaping. The UI download dialog stays thin: the
// backend decides both which reports exist and how each one is laid out.

import {
  buildReportRows,
  DashboardStats,
  humanize,
  ReportCell,
  ReportChart,
  ReportRow,
  ReportTable,
} from './report-file.builder';
import {
  FLOOD_CHARTLESS_STATS,
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

const compactCharts = (charts: Array<ReportChart | undefined>): ReportChart[] =>
  charts.filter((chart): chart is ReportChart => !!chart);

/** One series of label/value pairs — the shape most dashboard cards use. */
const valueChart = (
  title: string,
  categories: Array<string | number>,
  values: number[],
): ReportChart => ({
  kind: 'donut',
  title,
  categories: categories.map(String),
  series: [{ name: 'Count', values }],
});

/**
 * Chart straight from a stat's buckets, always as a donut — the report is
 * requested as pie charts, so even a ten-bucket list (banks, channels) is
 * drawn as one, with tiny slices folded into "Other" in the PDF builder.
 */
const bucketChart = (
  title: string,
  data: any,
  options: { hiddenIds?: string[]; hideZero?: boolean } = {}
): ReportChart | undefined => {
  const hidden = (options.hiddenIds ?? []).map((id) => id.toUpperCase());
  const buckets = bucketsOf(data).filter(
    (bucket) =>
      !hidden.includes(bucket.id.toUpperCase()) &&
      (!options.hideZero || bucket.count > 0)
  );
  if (!buckets.length) return undefined;

  return valueChart(
    title,
    buckets.map((bucket) => label(bucket.id)),
    buckets.map((bucket) => bucket.count)
  );
};

const makeTable = (
  title: string | undefined,
  columns: string[],
  rows: ReportCell[][],
  charts?: ReportChart[],
): ReportTable[] =>
  rows.length
    ? [
        {
          title,
          columns,
          rows,
          ...(charts?.length ? { charts } : {}),
        },
      ]
    : [];

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

  // Completed vs remaining per phase, the same split the tab's progress cards
  // show; the TOTAL row is left to the table so it is not counted twice. Two
  // series per phase means one ring per phase rather than a single pie.
  const phaseChart: ReportChart = {
    kind: 'donutGrid',
    title: 'Activities Status by Phase',
    categories: items.map((item: any) =>
      label(item?.phase?.name ?? item?.name ?? item?.id ?? 'UNKNOWN')
    ),
    series: [
      {
        name: 'Completed',
        values: items.map((item: any) => num(item?.totalCompletedActivities)),
      },
      {
        name: 'Remaining',
        values: items.map(
          (item: any) => num(item?.totalActivities) - num(item?.totalCompletedActivities)
        ),
      },
    ],
  };

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
      ...(items.length ? { charts: [phaseChart] } : {}),
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

  // Same buckets the rows below are built from, so chart and table agree.
  const gender = bucketsOf(benefData(stats, 'BENEFICIARY_GENDER'));
  const ageGroups = bucketsOf(benefData(stats, 'BENEFICIARY_AGEGROUPS'));
  const benefits = bucketsOf(benefData(stats, 'TYPE_OF_SSA'));

  return [
    // Summary mirrors the tab's number cards, which are not charts in the UI.
    ...makeTable('Summary', ['Metric', 'Count'], kpis),
    ...makeTable(
      'Gender Distribution',
      ['Gender', 'Beneficiaries'],
      gender.map((bucket) => [label(bucket.id), bucket.count]),
      compactCharts([
        bucketChart('Gender Distribution', benefData(stats, 'BENEFICIARY_GENDER')),
      ])
    ),
    ...makeTable(
      'Age Groups',
      ['Age Group', 'Beneficiaries'],
      ageGroups.map((bucket) => [label(bucket.id), bucket.count]),
      compactCharts([
        bucketChart('Age Groups', benefData(stats, 'BENEFICIARY_AGEGROUPS')),
      ])
    ),
    ...makeTable(
      'Vulnerable Groups',
      ['Group', 'Members'],
      vulnerable,
      compactCharts([
        vulnerable.length
          ? valueChart(
              'Vulnerable Groups',
              vulnerable.map((row) => String(row[0])),
              vulnerable.map((row) => num(row[1]))
            )
          : undefined,
      ])
    ),
    ...makeTable(
      'Social Protection Benefits',
      ['SSA Type', 'Households'],
      benefits.map((bucket) => [label(bucket.id), bucket.count]),
      compactCharts([
        bucketChart(
          'Social Protection Benefits',
          benefData(stats, 'TYPE_OF_SSA')
        ),
      ])
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

  const reportCharts = compactCharts(
    charts.map((chart) =>
      bucketChart(chart.title, benefData(stats, chart.name), {
        hideZero: chart.onlyPositive,
      })
    )
  );

  return makeTable(
    'Survey Responses',
    ['Survey Question', 'Response / Channel', 'Beneficiaries'],
    rows,
    reportCharts
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
      compactCharts(
        charts.map(([name, title]) =>
          bucketChart(title, benefData(stats, name))
        )
      )
    ),
    ...makeTable(
      'Bank Accounts',
      ['Bank', 'Beneficiaries'],
      bucketsOf(benefData(stats, 'BENEFICIARY_COUNTBYBANK')).map((bucket) => [
        bucket.id,
        bucket.count,
      ]),
      compactCharts([
        bucketChart('Bank Accounts', benefData(stats, 'BENEFICIARY_COUNTBYBANK')),
      ])
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

  const stakeholderMetrics: Array<[string, string | number]> = [
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

  const beneficiaryMetrics: Array<[string, string | number]> = [
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

  // Metrics the table renders as N/A have no length to draw, so they are
  // dropped from the chart rather than shown as a misleading zero bar.
  const audienceChart = (
    title: string,
    metrics: Array<[string, string | number]>
  ): ReportChart => {
    const numeric = metrics.filter(
      ([, value]) => String(value).trim() !== '' && Number.isFinite(Number(value))
    );
    return valueChart(
      title,
      numeric.map(([metric]) => metric),
      numeric.map(([, value]) => Number(value))
    );
  };

  return [
    // Summary mirrors the tab's number cards, not a chart.
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
      [
        audienceChart('Stakeholders', stakeholderMetrics),
        audienceChart('Beneficiaries', beneficiaryMetrics),
      ]
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

  const phaseNames = [...phaseCounts.keys()].map(label);
  const phaseCountsInOrder = [...phaseCounts.values()];
  const phaseRows: ReportCell[][] = [
    ...phaseCountsInOrder.map((counts, index) => countRow(phaseNames[index], counts)),
    countRow('TOTAL', overallStatusCounts),
  ];

  const sortedCategories = [...categoryCounts.entries()]
    .map(([name, counts]) => ({
      name,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    }))
    .sort((a, b) => b.total - a.total);
  const categoryRows: ReportCell[][] = [
    ...sortedCategories.map(({ name, counts }) => countRow(label(name), counts)),
    countRow('TOTAL', overallStatusCounts),
  ];

  // Charts mirror the tab: one status donut, then the per-phase and
  // per-category ring grid, all counted from the same rows as the tables.
  const segmentChart = (
    title: string,
    categories: string[],
    counts: Array<Record<string, number>>
  ): ReportChart => ({
    kind: 'donutGrid',
    title,
    categories,
    series: OVERVIEW_STATUS_COLUMNS.map(([status, heading]) => ({
      name: heading,
      values: counts.map((row) => num(row[status])),
    })),
  });

  const statusChart: ReportChart = {
    kind: 'donut',
    title: 'Activity Status',
    categories: statusHeaders,
    series: [
      {
        name: 'Activities',
        values: OVERVIEW_STATUS_COLUMNS.map(([status]) => statusCounts[status]),
      },
    ],
  };
  const phaseChart = segmentChart(
    'Activity Status by Phase',
    phaseNames,
    phaseCountsInOrder
  );
  const categoryChart = segmentChart(
    'Activity Status by Category',
    sortedCategories.map((entry) => label(entry.name)),
    sortedCategories.map((entry) => entry.counts)
  );

  return [
    ...makeTable('Summary', ['Metric', 'Value'], summary, [statusChart]),
    ...makeTable(
      'Activity Status by Phase',
      ['Phase', ...statusHeaders, 'Total'],
      phaseRows,
      [phaseChart],
    ),
    ...makeTable(
      'Activity Status by Category',
      ['Category', ...statusHeaders, 'Total'],
      categoryRows,
      [categoryChart],
    ),
  ];
};

/**
 * One chart for a Flood 2026 stat: a stat carrying `categories` + `series`
 * (age by gender, yes/no per category) becomes a donut grid with one ring per
 * category, everything else a single donut over its buckets. `kpi` stats are
 * listed in FLOOD_CHARTLESS_STATS and stay card rows with no chart.
 */
const floodChart = (title: string, data: any): ReportChart | undefined => {
  const series = list(data?.series);
  const categories = list(data?.categories);
  if (series.length && categories.length) {
    return {
      kind: 'donutGrid',
      title,
      categories: categories.map((value) => label(value)),
      series: series.map((entry: any) => ({
        name: label(entry?.name),
        values: list(entry?.data).map(num),
      })),
    };
  }

  return bucketChart(title, data, {
    hiddenIds: ['GENDER_AND_SEXUAL_MINORITY'],
  });
};

const flood26Tables = (
  definition: ReportDefinition,
  stats: DashboardStats,
): ReportTable[] => {
  const rows: ReportCell[][] = [];
  const charts: ReportChart[] = [];

  definition.selections.forEach((selection) => {
    (selection.names ?? []).forEach((name) => {
      const data = benefData(stats, name);
      if (!data) return;

      const chart =
        FLOOD_CHART_LABELS[name] ?? STAT_LABELS[name] ?? humanize(name);
      if (!FLOOD_CHARTLESS_STATS.has(name)) {
        const built = floodChart(chart, data);
        if (built) charts.push(built);
      }
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
    charts,
  );
};

const genericTables = (
  definition: ReportDefinition,
  stats: DashboardStats,
  options: BuildReportTablesOptions,
): ReportTable[] => {
  const rows = buildReportRows(definition, stats, options);

  // One chart per section (stat), the same card-per-stat layout the tab uses:
  // each section becomes its own donut, whatever its slice count.
  const sections = new Map<string, ReportRow[]>();
  rows.forEach((row) => {
    const group = sections.get(row.section) ?? [];
    group.push(row);
    sections.set(row.section, group);
  });
  const charts = compactCharts(
    [...sections.entries()].map(([section, items]) => {
      const numeric = items.filter(
        (item) =>
          String(item.value).trim() !== '' && Number.isFinite(Number(item.value))
      );
      if (!numeric.length) return undefined;
      return valueChart(
        section,
        numeric.map((item) => item.category),
        numeric.map((item) => Number(item.value))
      );
    })
  );

  return makeTable(
    undefined,
    ['Section', 'Category', 'Value'],
    rows.map((row) => [row.section, row.category, row.value]),
    charts
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
