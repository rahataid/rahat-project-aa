import { BeneficiaryExtrasRecord, StatCalculator } from '../types';
import {
  categorical,
  category,
  count,
  crossTab,
  multiSelect,
  ReportData,
  sums,
  UNKNOWN,
  yesNoGroup,
  yesNoOf,
  yesNoStat,
  yesOptions,
} from './report-builders';

export * from './report-builders';

// Reports for the 2026 flood household survey (field guide sections A–E).
// StatsCalculationService runs these in addition to the project's regular
// calculators, only for flood projects whose active year is 2026. Each stat
// is omitted when no household has the field, which is how the dashboard
// decides what to show.

const INCOME_SOURCES = {
  AGRICULTURE_LIVESTOCK: 'primary_source_of_income_agriculture_livestock',
  DAILY_WAGE_LABOR: 'primary_source_of_income_daily_wage_labor',
  BUSINESS: 'primary_source_of_income_business',
  SERVICE_JOB: 'primary_source_of_income_service_job',
  FOREIGN_EMPLOYMENT: 'primary_source_of_income_foreign_employment',
  OTHER_INCOME: 'primary_source_of_income_other',
};

const SOCIAL_PROTECTION = {
  NO_PROGRAM: 'other_social_protection_program_none',
  HEALTH_INSURANCE: 'other_social_protection_program_health_insurance',
  GOVERNMENT_PENSION: 'other_social_protection_program_government_pension',
  SCHOOL_SCHOLARSHIP: 'other_social_protection_program_school_scholarship',
  SAFE_MOTHERHOOD: 'other_social_protection_program_safe_motherhood_program',
  PM_EMPLOYMENT:
    'other_social_protection_program_prime_minister_employment_program',
  AGRICULTURE_FOOD_SUPPORT:
    'other_social_protection_program_agriculture_or_foodrelated_support',
  SOCIAL_SECURITY_FUND:
    'other_social_protection_program_social_security_fundrelated_program',
  OTHER_PROGRAM: 'Other Social Protection Program/ Other',
};

const HAZARDS = {
  FLOOD: 'annual_disaster_exposure_flood',
  FIRE: 'annual_disaster_exposure_fire',
  EARTHQUAKE: 'annual_disaster_exposure_earthquake',
  COLD_WAVE: 'annual_disaster_exposure_cold_wave',
  WINDSTORM: 'annual_disaster_exposure_windstorm',
  EPIDEMIC: 'annual_disaster_exposure_epidemic',
  ANIMAL_ATTACK: 'annual_disaster_exposure_animal_attack',
  OTHER_HAZARD: 'annual_disaster_exposure_other',
};

const FLOOD_DAMAGE = {
  CROP_DAMAGE: 'flood_damage_crop_damage',
  PROPERTY_DAMAGE: 'flood_damage_property_damage',
  LIVESTOCK_DAMAGE: 'flood_damage_livestock_damage',
  HUMAN_LOSS: 'flood_damage_human_loss',
  OTHER_DAMAGE: 'flood_damage_other',
};

const WARNING_CHANNELS = {
  FM_RADIO: 'early_warning_source_fm_radio',
  SOCIAL_MEDIA: 'early_warning_source_social_media',
  COMMUNITY_SIREN: 'early_warning_source_community_siren',
  MOBILE_PHONE_SMS: 'early_warning_source_mobile_phone_or_sms',
  BADGHAR_CHIRAKI: 'early_warning_source_badghar_chiraki',
  LOCAL_REPRESENTATIVE: 'early_warning_source_local_representative',
  NEWSPAPERS_MAGAZINES: 'early_warning_source_newspapers_magazines',
  RED_CROSS_VOLUNTEERS: 'early_warning_source_red_cross_volunteers',
  OTHER_CHANNEL: 'early_warning_source_other',
};

const RESPONSE_SKILLS = {
  SWIMMING: 'swimming_skills',
  TRAINED_VOLUNTEER: 'trained_flood_response_volunteer',
  SEARCH_AND_RESCUE: 'member_has_search_and_rescue_training',
};

const PREPAREDNESS = {
  RECEIVES_WARNING: 'receives_weather_early_warning',
  SAFE_EVACUATION_LOCATION: 'safe_evacuation_location_available',
  ...RESPONSE_SKILLS,
};

const AGE_BANDS = ['0-2', '2-5', '6-18', '19-59', 'above_60'];

const report = (
  name: string,
  build: (records: BeneficiaryExtrasRecord[]) => ReportData | null
): StatCalculator => ({
  key: name,
  async run({ allExtras }) {
    // Deleted beneficiaries are left out here only; the regular calculators
    // keep their existing behaviour.
    const data = build(allExtras.filter((r) => !r?.deletedAt));
    return data ? [{ name, data, group: 'beneficiary' }] : [];
  },
});

const householdSize = (records: BeneficiaryExtrasRecord[]) => {
  const sizes = ['1', '2', '3', '4', '5', '6', '7', '8+'];
  const buckets = sizes.map((id) => ({ id, count: 0 }));
  for (const r of records) {
    const n = count(r?.extras?.total_family_members);
    if (n && Number.isInteger(n)) buckets[Math.min(n, 8) - 1].count++;
  }
  const answered = buckets.reduce((s, b) => s + b.count, 0);
  if (!answered) return null;
  const unknown = records.length - answered;
  return {
    total: records.length,
    answered,
    buckets: unknown ? [...buckets, { id: UNKNOWN, count: unknown }] : buckets,
  };
};

const ageBand = (gender: string, band: string) =>
  `${gender}_members_aged_${band}_years`;

const populationByAgeAndGender = (records: BeneficiaryExtrasRecord[]) => {
  const bandsOf = (gender: string) =>
    Object.fromEntries(AGE_BANDS.map((band) => [band, ageBand(gender, band)]));
  const male = sums(records, bandsOf('male'));
  const female = sums(records, bandsOf('female'));
  if (!male && !female) return null;
  const answered = Math.max(male?.answered ?? 0, female?.answered ?? 0);
  return {
    total: records.length,
    answered,
    categories: AGE_BANDS,
    series: [
      {
        name: 'MALE',
        data: AGE_BANDS.map((_, i) => male?.buckets[i].count ?? 0),
      },
      {
        name: 'FEMALE',
        data: AGE_BANDS.map((_, i) => female?.buckets[i].count ?? 0),
      },
    ],
  };
};

const SECTION_A: StatCalculator[] = [
  report('FLOOD26_HOUSEHOLD_KPIS', (records) => {
    const people = sums(records, { PEOPLE: 'total_family_members' });
    return (
      people && {
        ...people,
        buckets: [
          { id: 'HOUSEHOLDS', count: records.length },
          ...people.buckets,
        ],
      }
    );
  }),
  report('FLOOD26_HOUSEHOLD_SIZE', householdSize),
  report('FLOOD26_POPULATION_BY_GENDER', (records) =>
    sums(records, {
      MALE: 'total_male_members',
      FEMALE: 'total_female_members',
      GENDER_AND_SEXUAL_MINORITY: 'gender_and_sexual_minority_members',
    })
  ),
  report('FLOOD26_POPULATION_BY_AGE_GENDER', populationByAgeAndGender),
  report('FLOOD26_CHILDREN_AND_OLDER', (records) => {
    const data = sums(records, {
      MALE_0_2: ageBand('male', '0-2'),
      FEMALE_0_2: ageBand('female', '0-2'),
      MALE_2_5: ageBand('male', '2-5'),
      FEMALE_2_5: ageBand('female', '2-5'),
      MALE_6_18: ageBand('male', '6-18'),
      FEMALE_6_18: ageBand('female', '6-18'),
      MALE_60: ageBand('male', 'above_60'),
      FEMALE_60: ageBand('female', 'above_60'),
    });
    if (!data) return null;
    const c = (i: number) => data.buckets[i].count + data.buckets[i + 1].count;
    return {
      ...data,
      buckets: [
        { id: 'CHILDREN_UNDER_5', count: c(0) + c(2) },
        { id: 'CHILDREN_6_18', count: c(4) },
        { id: 'OLDER_60_PLUS', count: c(6) },
      ],
    };
  }),
  report('FLOOD26_HOUSEHOLD_LEADERSHIP', (records) =>
    categorical(records, 'leadership_of_household')
  ),
  report('FLOOD26_DISABILITY_AND_ILLNESS', (records) =>
    yesNoGroup(records, {
      DISABILITY: 'family_memeber_with_disability',
      CHRONIC_ILLNESS: 'chronic_illness_or_ncds_in_family',
    })
  ),
  report('FLOOD26_PREGNANCY_AND_MATERNAL', (records) =>
    yesNoGroup(records, {
      PREGNANT_WOMEN: 'pregnant_women_in_family',
      MATERNAL_MOTHER: 'maternal_mother_in_family',
    })
  ),
];

const SECTION_B: StatCalculator[] = [
  report('FLOOD26_ANNUAL_INCOME', (records) =>
    categorical(records, 'annual_income')
  ),
  report('FLOOD26_INCOME_SOURCES', (records) =>
    multiSelect(records, INCOME_SOURCES)
  ),
  report('FLOOD26_PRIVATE_LAND', (records) =>
    categorical(records, 'private_agricultural_land')
  ),
  report('FLOOD26_CULTIVATED_LAND', (records) =>
    categorical(records, 'total_agricultural_land_used_for_cultivation')
  ),
  report('FLOOD26_LEASED_LAND', (records) =>
    categorical(
      records,
      'lease_sharecropping_contract_renttenancy_agricultural_land'
    )
  ),
  report('FLOOD26_LIVELIHOOD_CROP_DAMAGE', (records) =>
    crossTab(
      records,
      yesOptions(INCOME_SOURCES),
      yesNoOf('flood_damage_crop_damage')
    )
  ),
  report('FLOOD26_SOCIAL_PROTECTION', (records) =>
    multiSelect(records, SOCIAL_PROTECTION)
  ),
  report('FLOOD26_ELIGIBLE_NOT_RECEIVING_SS', (records) =>
    yesNoStat(records, 'eligible_but_not_receiving_social_security')
  ),
];

const SECTION_C: StatCalculator[] = [
  report('FLOOD26_ROOF_TYPE', (records) => categorical(records, 'roof_type')),
  report('FLOOD26_WALL_TYPE', (records) => categorical(records, 'wall_type')),
  report('FLOOD26_FLOOR_TYPE', (records) => categorical(records, 'floor_type')),
  report('FLOOD26_FRAME_STRUCTURE', (records) =>
    categorical(records, 'framestructure_type')
  ),
  report('FLOOD26_FOUNDATION', (records) =>
    categorical(records, 'house_foundation_type')
  ),
  report('FLOOD26_HOUSE_OWNERSHIP', (records) =>
    categorical(records, 'house_ownership')
  ),
  report('FLOOD26_HOUSE_STOREYS', (records) =>
    categorical(records, 'number_of_house_storeys')
  ),
  report('FLOOD26_FLOOR_HEIGHT', (records) =>
    categorical(records, 'floor_height_above_ground_ft')
  ),
  report('FLOOD26_ROOF_BY_WARD', (records) =>
    crossTab(records, category('ward'), category('roof_type'))
  ),
  report('FLOOD26_WALL_BY_WARD', (records) =>
    crossTab(records, category('ward'), category('wall_type'))
  ),
  report('FLOOD26_FLOOR_BY_WARD', (records) =>
    crossTab(records, category('ward'), category('floor_type'))
  ),
];

const SECTION_D: StatCalculator[] = [
  report('FLOOD26_HAZARD_EXPOSURE', (records) => multiSelect(records, HAZARDS)),
  report('FLOOD26_FLOOD_EXPOSURE_VS_IMPACT', (records) =>
    yesNoGroup(records, {
      FLOOD_EXPOSURE: HAZARDS.FLOOD,
      FLOOD_AFFECTED_20_YEARS: 'floodaffected_in_last_20_years',
    })
  ),
  report('FLOOD26_FLOOD_DAMAGE_TYPES', (records) =>
    multiSelect(records, FLOOD_DAMAGE)
  ),
  report('FLOOD26_HAZARD_BY_WARD', (records) =>
    crossTab(records, category('ward'), yesOptions(HAZARDS))
  ),
  report('FLOOD26_DAMAGE_BY_ROOF', (records) =>
    crossTab(records, category('roof_type'), yesOptions(FLOOD_DAMAGE))
  ),
  report('FLOOD26_DAMAGE_BY_WALL', (records) =>
    crossTab(records, category('wall_type'), yesOptions(FLOOD_DAMAGE))
  ),
  report('FLOOD26_DAMAGE_BY_FLOOR', (records) =>
    crossTab(records, category('floor_type'), yesOptions(FLOOD_DAMAGE))
  ),
];

const SECTION_E: StatCalculator[] = [
  report('FLOOD26_RECEIVES_WARNING', (records) =>
    yesNoStat(records, 'receives_weather_early_warning')
  ),
  report('FLOOD26_WARNING_CHANNELS', (records) =>
    multiSelect(records, WARNING_CHANNELS)
  ),
  report('FLOOD26_SAFE_EVACUATION_LOCATION', (records) =>
    yesNoStat(records, 'safe_evacuation_location_available')
  ),
  report('FLOOD26_EVACUATION_DESTINATION', (records) =>
    categorical(records, 'evacuation_destination_if_no_plan_exists')
  ),
  report('FLOOD26_EVACUATION_THRESHOLD', (records) =>
    categorical(records, 'flood_evacuation_threshold_for_family')
  ),
  report('FLOOD26_RESPONSE_SKILLS', (records) =>
    yesNoGroup(records, RESPONSE_SKILLS)
  ),
  report('FLOOD26_PREPAREDNESS_BY_WARD', (records) =>
    crossTab(records, category('ward'), yesOptions(PREPAREDNESS))
  ),
];

export const FLOOD_2026_REPORT_CALCULATORS: StatCalculator[] = [
  ...SECTION_A,
  ...SECTION_B,
  ...SECTION_C,
  ...SECTION_D,
  ...SECTION_E,
];
