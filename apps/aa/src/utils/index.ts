import { AGE_GROUPS, FIELD_MAP, TYPE_OF_SSA } from '../constants';

export function getAgeGroup(age: number): string {
  if (age < 20) return AGE_GROUPS.BELOW_20;
  if (age >= 20 && age <= 29) return AGE_GROUPS.AGE_19_TO_29;
  if (age >= 30 && age <= 45) return AGE_GROUPS.AGE_30_TO_45;
  if (age >= 46 && age <= 59) return AGE_GROUPS.AGE_46_TO_59;
  return AGE_GROUPS.ABOVE_60;
}
export function mapAgeGroupCounts(data: any[]): Record<string, number> {
  const counts: Record<string, number> = {
    [AGE_GROUPS.BELOW_20]: 0,
    [AGE_GROUPS.AGE_19_TO_29]: 0,
    [AGE_GROUPS.AGE_30_TO_45]: 0,
    [AGE_GROUPS.AGE_46_TO_59]: 0,
    [AGE_GROUPS.ABOVE_60]: 0,
  };

  for (const item of data) {
    const age = item?.extras?.interviewee_age;
    if (typeof age === 'number') {
      const group = getAgeGroup(age);
      counts[group]++;
    }
  }

  return counts;
}

export function countBySSAType(data: any[]) {
  const counts: Record<string, number> = {};

  // Initialize counts with zero
  Object.values(TYPE_OF_SSA).forEach((val) => {
    counts[val] = 0;
  });

  for (const item of data) {
    const ssaType = item?.extras?.type_of_ssa;

    // Skip if ssaType is '-' or falsy
    if (!ssaType || ssaType === '-') continue;

    if (Object.values(TYPE_OF_SSA).includes(ssaType)) {
      counts[ssaType] = (counts[ssaType] || 0) + 1;
    }
  }

  return counts;
}
function isPositive(val: any): boolean {
  const num = parseInt(val);
  return !isNaN(num) && num > 0;
}

export function countResult(data: any[]) {
  const counts: Record<string, number> = {
    [FIELD_MAP.NO_OF_LACTATING_WOMEN]: 0,
    [FIELD_MAP.NO_OF_PERSONS_WITH_DISABILITY]: 0,
    [FIELD_MAP.NO_OF_PREGNANT_WOMEN]: 0,
  };

  for (const item of data) {
    const extras = item.extras || {};
    for (const field of Object.values(FIELD_MAP)) {
      const rawVal = extras[field];
      if (rawVal === '' || rawVal === '-' || rawVal == null) {
        continue;
      }
      const val = parseInt(rawVal);
      if (!isNaN(val) && val > 0) {
        counts[field] += val;
      }
    }
  }
  return counts;
}

export function generateLocationStats<T>({
  dataList,
  getKeyParts,
  getCoordinates,
  keyFormat = (ward, municipality) => `ward${ward}_${municipality}`,
}: {
  dataList: T[];
  getKeyParts: (
    item: T
  ) => { municipality: string; ward_no: number } | undefined;
  getCoordinates: (
    item: T
  ) => { latitude: number; longitude: number } | undefined;
  keyFormat?: (ward: number, municipality: string) => string;
}): Record<
  string,
  {
    count: number;
    latitude: number[];
    longitude: number[];
  }
> {
  const result: Record<
    string,
    {
      count: number;
      latitudes: number[];
      longitudes: number[];
    }
  > = {};

  for (const item of dataList) {
    const keyParts = getKeyParts(item);
    const coords = getCoordinates(item);

    if (!keyParts || !coords) continue;

    const { municipality, ward_no } = keyParts;
    const { latitude, longitude } = coords;

    if (
      !municipality ||
      ward_no == null ||
      latitude == null ||
      longitude == null
    )
      continue;

    const key = keyFormat(ward_no, municipality);

    if (!result[key]) {
      result[key] = {
        count: 0,
        latitudes: [],
        longitudes: [],
      };
    }

    const group = result[key];
    group.count += 1;
    group.latitudes.push(latitude);
    group.longitudes.push(longitude);
  }

  const finalResult: Record<
    string,
    {
      count: number;
      latitude: number[];
      longitude: number[];
    }
  > = {};

  for (const [key, group] of Object.entries(result)) {
    const { latitudes, longitudes, count } = group;

    finalResult[key] = {
      count,
      latitude: latitudes,
      longitude: longitudes,
    };
  }

  return finalResult;
}

export function extractLatLng(gps?: string) {
  if (!gps) return { latitude: null, longitude: null };

  const parts = gps.trim().split(/\s+/);
  const latitude = parseFloat(parts[0]);
  const longitude = parseFloat(parts[1]);

  if (isNaN(latitude) || isNaN(longitude)) {
    return { latitude: null, longitude: null };
  }

  return { latitude, longitude };
}
