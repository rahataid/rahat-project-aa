import { StatsCalculationService } from '../../stats-calculation.service';
import { FLOOD_2026_REPORT_CALCULATORS } from '.';
import {
  categorical,
  crossTab,
  category,
  yesNoOf,
  yesOptions,
} from './report-builders';

// Trimmed from real 2026 survey extras: a full record, a second full one
// with an insurance-only field, and the sparse legacy-shaped record.
const full = {
  ward: '1',
  roof_type: 'Tile / slate',
  total_family_members: '4',
  total_male_members: '2',
  total_female_members: '2',
  'male_members_aged_6-18_years': '1',
  'female_members_aged_19-59_years': '1',
  receives_weather_early_warning: 'Yes',
  early_warning_source_fm_radio: 'No',
  early_warning_source_mobile_phone_or_sms: 'Yes',
  primary_source_of_income_agriculture_livestock: 'Yes',
  flood_damage_crop_damage: 'Yes',
  internetStatus: 'UNKNOWN',
  total_agricultural_land_used_for_cultivation: '1 Biggha',
};
const fullB = {
  ...full,
  ward: ' 1 ',
  roof_type: 'tile /  slate',
  receives_weather_early_warning: 'no',
  total_agricultural_land_used_for_cultivation: '1 biggha ',
};
const sparse = { phone: '+977', location: 'rampur', 'HH Gender': 'MALE' };

const records = [
  full,
  fullB,
  sparse,
  { ...sparse },
  { extras: null } as any,
].map((extras) => ('extras' in extras ? extras : { extras }));

const runAll = async (allExtras: any[]) => {
  const prisma: any = {
    beneficiary: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    stakeholders: { count: jest.fn().mockResolvedValue(0) },
  };
  const out = await Promise.all(
    FLOOD_2026_REPORT_CALCULATORS.map((c) => c.run({ prisma, allExtras }))
  );
  return Object.fromEntries(out.flat().map((s) => [s.name, s.data as any]));
};

describe('FLOOD_2026 calculators', () => {
  it('counts yes/no and puts missing values in UNKNOWN', async () => {
    const stats = await runAll(records);
    expect(stats.FLOOD26_RECEIVES_WARNING).toEqual({
      total: 5,
      answered: 2,
      buckets: [
        { id: 'YES', count: 1 },
        { id: 'NO', count: 1 },
        { id: 'UNKNOWN', count: 3 },
      ],
    });
  });

  it('omits stats whose fields no household has', async () => {
    const stats = await runAll(records);
    expect(stats.FLOOD26_HOUSE_OWNERSHIP).toBeUndefined();
    expect(stats.FLOOD26_FLOOD_DAMAGE_TYPES).toBeDefined();
    expect(await runAll([{ extras: sparse }])).not.toHaveProperty(
      'FLOOD26_HOUSEHOLD_KPIS'
    );
  });

  it('keeps multi-select options only when answered, flagged multi', async () => {
    const stats = await runAll(records);
    expect(stats.FLOOD26_WARNING_CHANNELS).toEqual({
      total: 5,
      answered: 2,
      multi: true,
      buckets: [
        { id: 'MOBILE_PHONE_SMS', count: 2 },
        { id: 'FM_RADIO', count: 0 },
        { id: 'UNKNOWN', count: 3 },
      ],
    });
  });

  it('merges free text by case and spacing', async () => {
    const stats = await runAll(records);
    expect(stats.FLOOD26_CULTIVATED_LAND.buckets[0]).toEqual({
      id: '1 Biggha',
      count: 2,
    });
    expect(stats.FLOOD26_ROOF_BY_WARD).toEqual({
      total: 5,
      answered: 2,
      categories: ['1'],
      series: [{ name: 'Tile / slate', data: [2] }],
    });
  });

  it('sums household and age/gender counts', async () => {
    const stats = await runAll(records);
    expect(stats.FLOOD26_HOUSEHOLD_KPIS.buckets).toEqual([
      { id: 'HOUSEHOLDS', count: 5 },
      { id: 'PEOPLE', count: 8 },
    ]);
    expect(stats.FLOOD26_POPULATION_BY_AGE_GENDER.series).toEqual([
      { name: 'MALE', data: [0, 0, 2, 0, 0] },
      { name: 'FEMALE', data: [0, 0, 0, 2, 0] },
    ]);
  });

  it('does not throw on malformed extras', async () => {
    const junk = [null, 'x', 1, [], { a: { b: 1 } }, { roof_type: {} }].map(
      (extras) => ({ extras })
    );
    await expect(runAll(junk as any)).resolves.toBeDefined();
  });

  it('rolls long tails into OTHERS and ignores an all-UNKNOWN column', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      extras: { roof_type: `t${i}`, ward: '1' },
    }));
    const data = categorical(many, 'roof_type');
    expect(data.buckets).toHaveLength(16);
    expect(data.buckets[15]).toEqual({ id: 'OTHERS', count: 5 });
    expect(
      crossTab(many, category('ward'), yesNoOf('flood_damage_crop_damage'))
    ).toBeNull();
    expect(crossTab(many, category('ward'), yesOptions({ X: 'x' }))).toBeNull();
  });
});

describe('StatsCalculationService.runAndSave', () => {
  const run = async (projectInfo: unknown) => {
    const saveMany = jest.fn();
    const prisma: any = {
      beneficiary: {
        findMany: jest.fn().mockResolvedValue([
          { extras: full, deletedAt: null },
          { extras: full, deletedAt: new Date() },
        ]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      stakeholders: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new StatsCalculationService(
      prisma,
      { saveMany } as any,
      { getPublic: jest.fn().mockResolvedValue({ value: projectInfo }) } as any
    );
    const stats = await service.runAndSave();
    return Object.fromEntries(stats.map((s) => [s.name, s.data as any]));
  };

  it('leaves the regular stats unchanged and adds no reports outside flood 2026', async () => {
    const flood2025 = await run({ PROJECT_TYPE: 'FLOOD', ACTIVE_YEAR: '2025' });
    const heat2026 = await run({
      PROJECT_TYPE: 'HEAT_WAVE',
      ACTIVE_YEAR: '2026',
    });
    for (const stats of [flood2025, heat2026]) {
      expect(Object.keys(stats).some((n) => n.startsWith('FLOOD26_'))).toBe(
        false
      );
    }
    expect(flood2025).toHaveProperty('total_number_family_members');
  });

  it.each([
    [{ PROJECT_TYPE: 'FLOOD', ACTIVE_YEAR: '2026' }],
    [{ PROJECT_TYPE: 'flood', ACTIVE_YEAR: 2026 }],
  ])('adds the reports on top of the regular stats for %j', async (info) => {
    const flood2026 = await run(info);
    const flood2025 = await run({ PROJECT_TYPE: 'FLOOD', ACTIVE_YEAR: '2025' });
    for (const [name, data] of Object.entries(flood2025)) {
      expect(flood2026[name]).toEqual(data);
    }
    // Deleted beneficiary excluded from the new reports only.
    expect(flood2026.FLOOD26_RECEIVES_WARNING.total).toBe(1);
  });
});
