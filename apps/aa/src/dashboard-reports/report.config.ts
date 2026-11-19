// Server-side catalog of downloadable dashboard reports. The ids and tab keys
// intentionally match the UI catalog so the frontend can offer the same list.

export type ReportFormat = 'xlsx' | 'pdf';

export type StatSource = 'benefStats' | 'triggeersStats' | 'tokenStats';

export type StatSelection = {
  source: StatSource;
  names?: string[];
  prefixes?: string[];
};

export type ReportDefinition = {
  id: string;
  /** Matching DASHBOARD_TAB_CONFIG value; '' means always available. */
  configKey: string;
  title: string;
  formats: ReportFormat[];
  selections: StatSelection[];
  requiresFlood2026?: boolean;
};

/** A report offered to the UI, derived from enabled tabs + project info + stats. */
export type DashboardReportSummary = {
  id: string;
  title: string;
  formats: ReportFormat[];
};

const flood2026 = (
  id: string,
  title: string,
  names: string[],
): ReportDefinition => ({
  id,
  configKey: id,
  title,
  formats: ['xlsx', 'pdf'],
  requiresFlood2026: true,
  selections: [{ source: 'benefStats', names }],
});

export const DASHBOARD_REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'overview',
    configKey: '',
    title: 'Project Overview',
    formats: ['xlsx', 'pdf'],
    selections: [{ source: 'triggeersStats', prefixes: ['ACTIVITIES_'] }],
  },
  {
    id: 'beneficiary-demographics',
    configKey: 'beneficiaryDemographics',
    title: 'Beneficiary Demographics',
    formats: ['xlsx', 'pdf'],
    selections: [
      {
        source: 'benefStats',
        names: [
          'TOTAL_RESPONDENTS',
          'TOTAL_NUMBER_FAMILY_MEMBERS',
          'BENEFICIARY_GENDER',
          'BENEFICIARY_AGEGROUPS',
          'TYPE_OF_SSA',
          'FIELD_MAP_RESULT',
        ],
      },
    ],
  },
  {
    id: 'flood-survey-data',
    configKey: 'floodSurveyData',
    title: 'Flood Survey Data',
    formats: ['xlsx', 'pdf'],
    selections: [
      {
        source: 'benefStats',
        names: [
          'FLOOD_AFFECTED_IN_5_YEARS',
          'RECEIVE_DISASTER_INFO',
          'CHANNEL_USAGE_STATS',
        ],
      },
    ],
  },
  {
    id: 'heatwave-survey-data',
    configKey: 'heatwaveSurveyData',
    title: 'Heatwave Survey Data',
    formats: ['xlsx', 'pdf'],
    selections: [
      {
        source: 'benefStats',
        names: [
          'COOLING_APPLIANCES_AVAILABLE_AT_HOME',
          'SAFE_DRINKING_WATER_AVAILABLE_AT_WORK',
          'IS_WORKPLACE_SAFE_DURING_EXTREME_HEAT',
          'DISTANCE_TO_THE_NEAREST_HEALTH_FACILITY',
          'TYPE_OF_HOUSE',
          'ACTIVITIES_STATUS',
        ],
      },
    ],
  },
  {
    id: 'token-stats',
    configKey: 'tokenStats',
    title: 'Token Stats',
    formats: ['xlsx', 'pdf'],
    selections: [{ source: 'tokenStats' }],
  },
  {
    id: 'access-inclusion',
    configKey: 'accessInclusion',
    title: 'Access & Inclusion',
    formats: ['xlsx', 'pdf'],
    selections: [
      {
        source: 'benefStats',
        names: [
          'DO_YOU_HAVE_ACCESS_TO_MOBILE_PHONES',
          'DO_YOU_HAVE_ACCESS_TO_INTERNET',
          'USE_DIGITAL_WALLETS',
          'TYPE_OF_PHONE',
          'HAVE_ACTIVE_BANK_AC',
          'SSA_RECIPIENT_IN_HH',
          'BENEFICIARY_COUNTBYBANK',
        ],
      },
    ],
  },
  {
    id: 'communication-outreach',
    configKey: 'communicationOutreach',
    title: 'Communication & Outreach',
    formats: ['xlsx', 'pdf'],
    selections: [
      { source: 'benefStats', names: ['STAKEHOLDERS_TOTAL'] },
      {
        source: 'triggeersStats',
        prefixes: [
          'ACTIVITIES_WITH_COMM',
          'ACTIVITIES_AUTOMATED',
          'COMMS_STATS',
          'BENEFICIARY_',
          'STAKEHOLDERS_',
        ],
      },
    ],
  },
  flood2026('flood26Demographics', 'Flood 2026 Household Demographics', [
    'FLOOD26_HOUSEHOLD_KPIS',
    'FLOOD26_HOUSEHOLD_SIZE',
    'FLOOD26_POPULATION_BY_GENDER',
    'FLOOD26_POPULATION_BY_AGE_GENDER',
    'FLOOD26_HOUSEHOLD_LEADERSHIP',
    'FLOOD26_DISABILITY_AND_ILLNESS',
    'FLOOD26_PREGNANCY_AND_MATERNAL',
  ]),
  flood2026('flood26Livelihood', 'Flood 2026 Livelihood', [
    'FLOOD26_ANNUAL_INCOME',
    'FLOOD26_INCOME_SOURCES',
    'FLOOD26_PRIVATE_LAND',
    'FLOOD26_LEASED_LAND',
    'FLOOD26_SOCIAL_PROTECTION',
    'FLOOD26_ELIGIBLE_NOT_RECEIVING_SS',
  ]),
  flood2026('flood26Housing', 'Flood 2026 Housing', [
    'FLOOD26_ROOF_TYPE',
    'FLOOD26_WALL_TYPE',
    'FLOOD26_FLOOR_TYPE',
    'FLOOD26_FRAME_STRUCTURE',
    'FLOOD26_FOUNDATION',
    'FLOOD26_HOUSE_OWNERSHIP',
  ]),
  flood2026('flood26Exposure', 'Flood 2026 Disaster Exposure', [
    'FLOOD26_HAZARD_EXPOSURE',
    'FLOOD26_FLOOD_EXPOSURE_VS_IMPACT',
    'FLOOD26_FLOOD_DAMAGE_TYPES',
  ]),
  flood2026('flood26Preparedness', 'Flood 2026 Preparedness', [
    'FLOOD26_RECEIVES_WARNING',
    'FLOOD26_SAFE_EVACUATION_LOCATION',
    'FLOOD26_WARNING_CHANNELS',
    'FLOOD26_EVACUATION_THRESHOLD',
    'FLOOD26_RESPONSE_SKILLS',
  ]),
];

/** Human-readable titles used in the exported files, keyed by clean stat name. */
export const STAT_LABELS: Record<string, string> = {
  TOTAL_RESPONDENTS: 'Total Respondents',
  TOTAL_NUMBER_FAMILY_MEMBERS: 'Total Family Members',
  BENEFICIARY_GENDER: 'Gender Distribution',
  BENEFICIARY_AGEGROUPS: 'Age Groups',
  TYPE_OF_SSA: 'Social Security Type',
  FIELD_MAP_RESULT: 'Field Map Result',
  FLOOD_AFFECTED_IN_5_YEARS: 'Flood Affected in Last 5 Years',
  RECEIVE_DISASTER_INFO: 'Received Disaster Information',
  CHANNEL_USAGE_STATS: 'Communication Channel Usage',
  ACTIVITIES_WITH_COMM: 'Activities with Communication',
  ACTIVITIES_AUTOMATED: 'Activities Automated',
  ACTIVITIES_STATUS: 'Activities Status',
  COMMS_STATS: 'Communication Stats',
  STAKEHOLDERS_TOTAL: 'Total Stakeholders',
  BENEFICIARY_COUNTBYBANK: 'Beneficiary Count by Bank',
  DO_YOU_HAVE_ACCESS_TO_MOBILE_PHONES: 'Access to Mobile Phones',
  DO_YOU_HAVE_ACCESS_TO_INTERNET: 'Access to Internet',
  USE_DIGITAL_WALLETS: 'Digital Wallet Use',
  TYPE_OF_PHONE: 'Types of Phone',
  HAVE_ACTIVE_BANK_AC: 'Bank Account Access',
  SSA_RECIPIENT_IN_HH: 'Social Security Linked to Bank Account',
  COOLING_APPLIANCES_AVAILABLE_AT_HOME: 'Cooling Appliances at Home',
  SAFE_DRINKING_WATER_AVAILABLE_AT_WORK: 'Safe Drinking Water at Work',
  IS_WORKPLACE_SAFE_DURING_EXTREME_HEAT: 'Workplace Safe During Extreme Heat',
  DISTANCE_TO_THE_NEAREST_HEALTH_FACILITY: 'Distance to Nearest Health Facility',
  TYPE_OF_HOUSE: 'Type of House',
  FLOOD26_HOUSEHOLD_KPIS: 'Population Covered',
  FLOOD26_HOUSEHOLD_SIZE: 'Household Size Distribution',
  FLOOD26_POPULATION_BY_GENDER: 'Population by Gender',
  FLOOD26_POPULATION_BY_AGE_GENDER: 'Population by Age and Gender',
  FLOOD26_HOUSEHOLD_LEADERSHIP: 'Household Leadership',
  FLOOD26_DISABILITY_AND_ILLNESS: 'Disability and Chronic Illness',
  FLOOD26_PREGNANCY_AND_MATERNAL: 'Pregnancy and Maternal',
  FLOOD26_ANNUAL_INCOME: 'Annual Income Distribution',
  FLOOD26_INCOME_SOURCES: 'Primary Livelihood',
  FLOOD26_PRIVATE_LAND: 'Agricultural Land Holding',
  FLOOD26_LEASED_LAND: 'Leased Land',
  FLOOD26_SOCIAL_PROTECTION: 'Social Protection Coverage',
  FLOOD26_ELIGIBLE_NOT_RECEIVING_SS:
    'Eligible Not Receiving Social Security',
  FLOOD26_ROOF_TYPE: 'Roof Type',
  FLOOD26_WALL_TYPE: 'Wall Type',
  FLOOD26_FLOOR_TYPE: 'Floor Type',
  FLOOD26_FRAME_STRUCTURE: 'Frame Structure',
  FLOOD26_FOUNDATION: 'Foundation Type',
  FLOOD26_HOUSE_OWNERSHIP: 'House Ownership',
  FLOOD26_HAZARD_EXPOSURE: 'Exposure by Hazard',
  FLOOD26_FLOOD_EXPOSURE_VS_IMPACT: 'Flood Exposure vs Impact',
  FLOOD26_FLOOD_DAMAGE_TYPES: 'Flood Damage Types',
  FLOOD26_RECEIVES_WARNING: 'Receives Weather Warning',
  FLOOD26_SAFE_EVACUATION_LOCATION: 'Safe Evacuation Location',
  FLOOD26_WARNING_CHANNELS: 'Warning Channels Used',
  FLOOD26_EVACUATION_THRESHOLD: 'Evacuation Threshold',
  FLOOD26_RESPONSE_SKILLS: 'Swimming and Response Training',
  SESSIONCOUNT: 'Session Count',
  BENEFICIARY: 'Beneficiary',
  STAKEHOLDERS: 'Stakeholders',
  VOICE: 'Voice',
  SMS: 'SMS',
  SUCCESS: 'Successful',
  FAIL: 'Failed',
};
