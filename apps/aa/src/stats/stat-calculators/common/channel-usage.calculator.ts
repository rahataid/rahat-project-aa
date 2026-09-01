import { toPascalCase } from '../../../utils';
import { StatCalcContext, StatCalculator } from '../types';

const CHANNEL_FIELDS = [
  'channelcommunity',
  'channelfm_radio',
  'channelmobile_phone___sms',
  'channelnewspaper',
  'channelothers',
  'channelpeople_representatives',
  'channelrelatives',
  'channelsocial_media',
];

export const channelUsageCalculator: StatCalculator = {
  key: 'CHANNEL_USAGE_STATS',
  async run({ allExtras }: StatCalcContext) {
    const counts: Record<string, number> = {};
    for (const field of CHANNEL_FIELDS) counts[field] = 0;

    for (const item of allExtras) {
      for (const field of CHANNEL_FIELDS) {
        if (item.extras?.[field] === 1) counts[field] += 1;
      }
    }

    const data = Object.entries(counts).map(([key, count]) => ({
      id: toPascalCase(key),
      count,
    }));

    return { name: 'channel_usage_stats', data, group: 'beneficiary_channel' };
  },
};
