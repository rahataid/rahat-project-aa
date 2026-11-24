// Server-side catalog of downloadable dashboard reports. The ids and tab keys
// intentionally match the UI catalog so the frontend can offer the same list.

export type ReportFormat = 'xlsx' | 'pdf';

export type StatSource = 'benefStats' | 'triggeersStats' | 'tokenStats';

export type StatSelection = {
  source: StatSource;
  names?: string[];
  prefixes?: string[];
};

export type ReportLayout =
  | 'generic'
  | 'overview'
  | 'beneficiary'
  | 'floodSurvey'
  | 'access'
  | 'communication'
  | 'activitiesOverview'
  | 'flood26';

/**
 * Chart shapes the PDF can draw (Excel never renders charts).
 * - `donut`     parts of one whole — every single-list split, whatever the slice count
 * - `donutGrid` one small donut per row, for tables that carry two dimensions
 *               (status by phase, age by gender): a single pie cannot show them
 */
export type ReportChartKind = 'donut' | 'donutGrid';

export type ReportDefinition = {
  id: string;
  /** Matching DASHBOARD_TAB_CONFIG value; '' means always available. */
  configKey: string;
  title: string;
  formats: ReportFormat[];
  selections: StatSelection[];
  /** Chooses the backend row/header shaping used by Excel and PDF. */
  layout: ReportLayout;
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
  layout: 'flood26',
  requiresFlood2026: true,
  selections: [{ source: 'benefStats', names }],
});

export const DASHBOARD_REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'overview',
    configKey: '',
    title: 'Project Overview',
    formats: ['xlsx', 'pdf'],
    layout: 'overview',
    selections: [{ source: 'triggeersStats', prefixes: ['ACTIVITIES_'] }],
  },
  {
    // Rows come from live activities in the triggers service, not AA stats.
    id: 'activity-overview',
    configKey: 'activitiesOverview',
    title: 'Activity Overview',
    formats: ['xlsx', 'pdf'],
    layout: 'activitiesOverview',
    selections: [],
  },
  {
    id: 'beneficiary-demographics',
    configKey: 'beneficiaryDemographics',
    title: 'Beneficiary Demographics',
    formats: ['xlsx', 'pdf'],
    layout: 'beneficiary',
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
    layout: 'floodSurvey',
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
    layout: 'generic',
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
    layout: 'generic',
    selections: [{ source: 'tokenStats' }],
  },
  {
    id: 'access-inclusion',
    configKey: 'accessInclusion',
    title: 'Access & Inclusion',
    formats: ['xlsx', 'pdf'],
    layout: 'access',
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
    layout: 'communication',
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

/** Chart titles shown in the Flood 2026 tabs (mirror `FLOOD_REPORT` messages). */
export const FLOOD_CHART_LABELS: Record<string, string> = {
  FLOOD26_HOUSEHOLD_KPIS: 'Population covered',
  FLOOD26_HOUSEHOLD_SIZE: 'Household size',
  FLOOD26_POPULATION_BY_GENDER: 'Population by gender',
  FLOOD26_POPULATION_BY_AGE_GENDER: 'Population by age and gender',
  FLOOD26_HOUSEHOLD_LEADERSHIP: 'Household leadership',
  FLOOD26_DISABILITY_AND_ILLNESS: 'Disability and chronic illness',
  FLOOD26_PREGNANCY_AND_MATERNAL: 'Pregnant and maternal mothers',
  FLOOD26_ANNUAL_INCOME: 'Annual income',
  FLOOD26_INCOME_SOURCES: 'Primary source of income',
  FLOOD26_PRIVATE_LAND: 'Private agricultural land',
  FLOOD26_LEASED_LAND: 'Leased / sharecropped land',
  FLOOD26_SOCIAL_PROTECTION: 'Social protection coverage',
  FLOOD26_ELIGIBLE_NOT_RECEIVING_SS:
    'Eligible but not receiving social security',
  FLOOD26_ROOF_TYPE: 'Roof material',
  FLOOD26_WALL_TYPE: 'Wall material',
  FLOOD26_FLOOR_TYPE: 'Floor material',
  FLOOD26_FRAME_STRUCTURE: 'Frame structure',
  FLOOD26_FOUNDATION: 'Foundation',
  FLOOD26_HOUSE_OWNERSHIP: 'House ownership',
  FLOOD26_HAZARD_EXPOSURE: 'Exposure by hazard',
  FLOOD26_FLOOD_EXPOSURE_VS_IMPACT: 'Flood exposure vs historical impact',
  FLOOD26_FLOOD_DAMAGE_TYPES: 'Flood damage types',
  FLOOD26_RECEIVES_WARNING: 'Households receiving weather warnings',
  FLOOD26_SAFE_EVACUATION_LOCATION: 'Safe evacuation location',
  FLOOD26_WARNING_CHANNELS: 'Warning channels used',
  FLOOD26_EVACUATION_THRESHOLD: 'When the family evacuates',
  FLOOD26_RESPONSE_SKILLS: 'Swimming and response training',
};

/**
 * Flood 2026 stats with no chart: `FLOOD26_HOUSEHOLD_KPIS` is the lone `kpi`
 * entry in the UI's `FLOOD_REPORT_TABS` — it renders as number cards there and
 * is a table here. Every other stat charts itself: buckets become one donut,
 * series (age × gender, yes/no per category) become a donut grid.
 */
export const FLOOD_CHARTLESS_STATS = new Set<string>(['FLOOD26_HOUSEHOLD_KPIS']);

/** Labels for bucket/series ids, mirroring the dashboard translations. */
export const VALUE_LABELS: Record<string, string> = {
  YES: 'Yes',
  NO: 'No',
  UNKNOWN: 'Unknown',
  OTHERS: 'Others',
  OTHER: 'Other',
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER_INCOME: 'Other income',
  HOUSEHOLDS: 'Households',
  PEOPLE: 'People',
  PREPAREDNESS: 'Preparedness',
  READINESS: 'Readiness',
  ACTIVATION: 'Activation',
  RESPONSE: 'Response',
  MITIGATION: 'Mitigation',
  RECOVERY: 'Recovery',
  PLANNING: 'Planning',
  '0-2': '0–2 yrs',
  '2-5': '2–5 yrs',
  '6-18': '6–18 yrs',
  '19-59': '19–59 yrs',
  above_60: '60+ yrs',
  ABOVE_60: '60+ yrs',
  CHILDREN_UNDER_5: 'Children under 5',
  CHILDREN_6_18: 'Children 6–18',
  OLDER_60_PLUS: 'Older people 60+',
  DISABILITY: 'Member with disability',
  CHRONIC_ILLNESS: 'Chronic illness / NCDs',
  PREGNANT_WOMEN: 'Pregnant women',
  MATERNAL_MOTHER: 'Maternal mothers',
  AGRICULTURE_LIVESTOCK: 'Agriculture / livestock',
  DAILY_WAGE_LABOR: 'Daily wage labour',
  BUSINESS: 'Business',
  SERVICE_JOB: 'Service / job',
  FOREIGN_EMPLOYMENT: 'Foreign employment',
  NO_PROGRAM: 'No programme',
  HEALTH_INSURANCE: 'Health insurance',
  GOVERNMENT_PENSION: 'Government pension',
  SCHOOL_SCHOLARSHIP: 'School scholarship',
  SAFE_MOTHERHOOD: 'Safe motherhood programme',
  PM_EMPLOYMENT: 'PM employment programme',
  AGRICULTURE_FOOD_SUPPORT: 'Agriculture / food support',
  SOCIAL_SECURITY_FUND: 'Social security fund',
  OTHER_PROGRAM: 'Other programme',
  FLOOD: 'Flood',
  FIRE: 'Fire',
  EARTHQUAKE: 'Earthquake',
  COLD_WAVE: 'Cold wave',
  WINDSTORM: 'Windstorm',
  EPIDEMIC: 'Epidemic',
  ANIMAL_ATTACK: 'Animal attack',
  OTHER_HAZARD: 'Other hazard',
  CROP_DAMAGE: 'Crop damage',
  PROPERTY_DAMAGE: 'Property damage',
  LIVESTOCK_DAMAGE: 'Livestock damage',
  HUMAN_LOSS: 'Human loss',
  OTHER_DAMAGE: 'Other damage',
  FLOOD_EXPOSURE: 'Exposed to floods yearly',
  FLOOD_AFFECTED_20_YEARS: 'Flood-affected in last 20 years',
  FM_RADIO: 'FM Radio',
  FmRadio: 'FM Radio',
  SOCIAL_MEDIA: 'Social Media',
  SocialMedia: 'Social Media',
  COMMUNITY_SIREN: 'Community siren',
  MOBILE_PHONE_SMS: 'Mobile Phone SMS',
  MobilePhoneSms: 'Mobile Phone SMS',
  BADGHAR_CHIRAKI: 'Badghar / chiraki',
  LOCAL_REPRESENTATIVE: 'Local representative',
  PeopleRepresentatives: "People's Representatives",
  NEWSPAPERS_MAGAZINES: 'Newspapers / magazines',
  RED_CROSS_VOLUNTEERS: 'Red Cross volunteers',
  OTHER_CHANNEL: 'Other channel',
  SWIMMING: 'Swimming skills',
  TRAINED_VOLUNTEER: 'Trained flood response volunteer',
  SEARCH_AND_RESCUE: 'Search & rescue training',
  senior_citizen__70: 'Senior Citizen >70',
  senior_citizen__60__dalit: 'Senior Citizen Dalit >60',
  child_nutrition: 'Child Nutrition',
  single_woman: 'Single Women',
  widow: 'Widow',
  red_class: 'Red Card',
  blue_card: 'Blue Card',
  indigenous_community: 'Indigenous Community',
  no_of_pregnant_women: 'Pregnant Female',
  no_of_lactating_women: 'Lactating Female',
  no_of_persons_with_disability: 'People with Disabilities',
};

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
