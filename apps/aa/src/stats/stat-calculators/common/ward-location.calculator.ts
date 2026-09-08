import { extractLatLng, generateLocationStats } from '../../../utils';
import { StatCalcContext, StatCalculator } from '../types';

// Produces one stat row per ward (WARD3, WARD5, ...) rather than a single
// named stat, so it isn't gated by BENEF_STATS_BY_PROJECT_TYPE — it's
// always included, matching the "common, dynamic" WARD* field.
export const wardLocationCalculator: StatCalculator = {
  key: 'WARD_LOCATION',
  async run({ allExtras }: StatCalcContext) {
    const wardLocationStats = generateLocationStats({
      dataList: allExtras,
      getKeyParts: (item) => {
        const extras = item.extras as { ward_no?: number };
        return extras?.ward_no != null ? { ward_no: extras.ward_no } : undefined;
      },
      getCoordinates: (item) => {
        const extras = item?.extras as { gps?: string };
        const coords = extractLatLng(extras?.gps);
        return coords.latitude != null
          ? (coords as { latitude: number; longitude: number })
          : undefined;
      },
    });

    return Object.entries(wardLocationStats).map(([name, data]) => ({
      name,
      data,
      group: 'beneficiary_gps_location',
    }));
  },
};
