import { Injectable } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { StatsService } from '../stats';
import { mapVulnerabilityStatusCount } from '../utils/vulnerabilityCountHelpers';
import { AGE_GROUPS, VULNERABILITY_FIELD } from '../constants';
import {
  countBySSAType,
  countResult,
  extractLatLng,
  generateLocationStats,
  getAgeGroup,
  mapAgeGroupCounts,
  toPascalCase,
} from '../utils';

@Injectable()
export class BeneficiaryStatService {
  constructor(
    protected prisma: PrismaService,
    private readonly statsService: StatsService
  ) {}

  async totalBeneficiaries() {
    return {
      count: await this.prisma.beneficiary.count({
        where: { deletedAt: null },
      }),
    };
  }

  async countExtrasFieldValuesNormalized(field: string, expected: string[]) {
    const results = await this.prisma.beneficiary.findMany({
      select: {
        extras: true,
      },
    });

    // Initialize counts with 0 for each expected value
    const counts: Record<string, number> = {};
    for (const key of expected) {
      counts[key] = 0;
    }

    for (const item of results) {
      const rawVal = item.extras?.[field];

      if (typeof rawVal === 'string') {
        const normalized = rawVal.trim().toLowerCase(); // Normalize
        if (expected.includes(normalized)) {
          counts[normalized] += 1;
        }
      }
    }

    return Object.entries(counts).map(([key, count]) => ({
      id: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize
      count,
    }));
  }

  async calculateGenderStats() {
    const genderStats = await this.prisma.beneficiary.groupBy({
      by: ['gender'],
      _count: {
        gender: true,
      },
    });

    return genderStats.map((stat) => ({
      id: stat.gender,
      count: stat._count.gender,
    }));
  }

  async calculateVulnerabilityStats() {
    const vulnerabilityCounts = await Promise.all([
      this.prisma.beneficiary.count({
        where: {
          extras: {
            path: ['isVulnerable'],
            equals: 'Yes',
          },
        },
      }),
      this.prisma.beneficiary.count({
        where: {
          extras: {
            path: ['isVulnerable'],
            equals: 'No',
          },
        },
      }),
    ]);

    return [
      { id: 'Vulnerable', count: vulnerabilityCounts[0] },
      { id: 'Not_Vulnerable', count: vulnerabilityCounts[1] },
    ];
  }

  countByBank(array) {
    return array.reduce((result, currentValue) => {
      const bankValue = currentValue.extras.bank_name;
      if (bankValue) {
        if (!result[bankValue]) {
          result[bankValue] = 0;
        }
        result[bankValue]++;
      }
      return result;
    }, {});
  }

  async calculateCountByBankStats() {
    const results = await this.prisma.beneficiary.findMany({
      where: {
        extras: {
          path: ['bank_name'],
          not: null || '',
        },
      },
      select: {
        uuid: true,
        extras: true,
      },
    });

    const bankCounts = this.countByBank(results);
    const resultArray = Object.keys(bankCounts).map((key) => {
      return {
        id: key,
        count: bankCounts[key],
      };
    });
    return resultArray;
  }

  filterAndCountPhoneStatus(data) {
    let unPhonedCount = 0;
    let phonedCount = 0;

    data.forEach((record) => {
      const phoneNumber = record.extras.phone;
      if (phoneNumber.startsWith('999')) {
        unPhonedCount += 1;
      } else {
        phonedCount += 1;
      }
    });

    return [
      { id: 'Phoned', count: phonedCount },
      { id: 'UnPhoned', count: unPhonedCount },
    ];
  }

  async calculatePhoneStatusStats() {
    const results = await this.prisma.beneficiary.findMany({
      where: {
        extras: {
          path: ['phone'],
          // ensure phone exists
          not: null || '',
        },
      },
      select: {
        uuid: true,
        extras: true,
      },
    });
    const finalResult = this.filterAndCountPhoneStatus(results);
    return finalResult;
  }

  async calculateVulnerabilityCountStats() {
    const benef = await this.prisma.beneficiary.findMany({});
    const myData = mapVulnerabilityStatusCount(benef);
    return Object.keys(myData).map((d) => ({
      id: d,
      count: myData[d],
    }));
  }

  async calculateTypeOfSSA() {
    const benef = await this.prisma.beneficiary.findMany({});
    const myData = countBySSAType(benef);
    return Object.keys(myData).map((d) => ({
      id: d,
      count: myData[d],
    }));
  }

  async calculateBeneflocationStats() {
    const benef = await this.prisma.beneficiary.findMany({});

    const wardLocationStats = generateLocationStats({
      dataList: benef,
      getKeyParts: (item) => {
        const extras = item.extras as { ward_no?: number };
        return {
          ward_no: extras?.ward_no,
        };
      },

      getCoordinates: (item) => {
        const extras = item?.extras as { gps?: string };

        return extractLatLng(extras?.gps);
      },
    });
    const k = Object.entries(wardLocationStats).map(([key, value]) => ({
      name: key.toString(),
      data: value,
      group: 'beneficiary_gps_location',
    }));

    return k;
  }

  async calculateHouseholdCashSupport() {
    return this.prisma.beneficiary.count({
      where: {
        benTokens: {
          gt: 0,
        },
      },
    });
  }

  async calculateAgeGroups() {
    const benef = await this.prisma.beneficiary.findMany({});
    const ageGroupCounts = mapAgeGroupCounts(benef);
    return Object.keys(ageGroupCounts).map((d) => ({
      id: d,
      count: ageGroupCounts[d],
    }));
  }

  async calculateTotalFamilyMembers() {
    const benefs = await this.prisma.beneficiary.findMany();

    const total = benefs.reduce((sum, ben) => {
      const extras = ben.extras as {
        total_number_of_family_members?: number;
      };
      const members = Number(extras?.total_number_of_family_members || 0);
      return sum + members;
    }, 0);

    return { count: total };
  }
  async fieldMapResult() {
    const benefs = await this.prisma.beneficiary.findMany();
    return countResult(benefs);
  }

  async calculateChannelUsageStats() {
    const fields = [
      'channelcommunity',
      'channelfm_radio',
      'channelmobile_phone___sms',
      'channelnewspaper',
      'channelothers',
      'channelpeople_representatives',
      'channelrelatives',
      'channelsocial_media',
    ];

    const results = await this.prisma.beneficiary.findMany({
      select: {
        uuid: true,
        extras: true,
      },
    });

    const counts: Record<string, number> = {};

    for (const field of fields) {
      counts[field] = 0;
    }

    for (const item of results) {
      for (const field of fields) {
        if (item.extras?.[field] === 1) {
          counts[field] += 1;
        }
      }
    }

    return Object.entries(counts).map(([key, count]) => ({
      id: toPascalCase(key),
      count,
    }));
  }
  async phoneTypeDistribution() {
    const rData = await this.countExtrasFieldValuesNormalized(
      'type_of_phone_set',
      ['smartphone', 'keypad', 'both', 'brick']
    );
    const result = [];

    let keypadBrickCount = 0;

    for (const item of rData) {
      if (item.id === 'Keypad' || item.id === 'Brick') {
        keypadBrickCount += item.count;
      } else {
        result.push(item);
      }
    }

    result.push({ id: 'Keypad/Brick', count: keypadBrickCount });

    return result;
  }

  async calculateUniqueWards() {
    const rData = await this.prisma.beneficiary.findMany({
      select: {
        extras: true,
      },
    });
    const uniqueWards = Array.from(
      new Set(
        rData
          .map((item) => {
            const extras = item.extras as { ward_no?: number };
            return extras?.ward_no;
          })
          .filter((ward) => typeof ward === 'number')
      )
    )
      .sort((a, b) => a - b)
      .map((ward) => ({ ward }));

    return uniqueWards;
  }

  async getExtrasStats() {
    const keys = [
      'flood_affected_in_5_years',
      'use_digital_wallets',
      'do_you_have_access_to_internet',
      'do_you_have_access_to_mobile_phones',
      'ssa_recipient_in_hh',
      'have_active_bank_ac',
      'receive_disaster_info',
    ];

    const responses = await Promise.all(
      keys.map(async (key) => {
        const value = await this.countExtrasFieldValuesNormalized(key, [
          'yes',
          'no',
        ]);
        return { name: key, data: value, group: 'beneficiary' };
      })
    );

    return responses;
  }

  async calculateAllStats() {
    const [
      total,
      gender,
      countByBank,
      calculateAgeGroups,
      calculateTotalFamilyMembers,
      calculateTypeOfSSA,
      fieldMapResult,
      calculateBeneflocationStats,
      calculateChannelUsageStats,
      extrasStats,
      phoneTypeDistribution,
      calculateUniqueWards,
    ] = await Promise.all([
      this.totalBeneficiaries(),
      this.calculateGenderStats(),
      this.calculateCountByBankStats(),
      this.calculateAgeGroups(),
      this.calculateTotalFamilyMembers(),
      this.calculateTypeOfSSA(),
      this.fieldMapResult(),
      this.calculateBeneflocationStats(),
      this.calculateChannelUsageStats(),
      this.getExtrasStats(),
      this.phoneTypeDistribution(),
      this.calculateUniqueWards(),
    ]);
    return {
      total,
      gender,
      countByBank,
      calculateAgeGroups,
      calculateTotalFamilyMembers,
      calculateTypeOfSSA,
      fieldMapResult,
      calculateBeneflocationStats,
      calculateChannelUsageStats,
      phoneTypeDistribution,
      extrasStats,
      calculateUniqueWards,
    };
  }

  async saveAllStats() {
    const {
      total,
      gender,
      countByBank,
      calculateAgeGroups,
      calculateTotalFamilyMembers,
      calculateTypeOfSSA,
      fieldMapResult,
      calculateBeneflocationStats,
      calculateChannelUsageStats,
      phoneTypeDistribution,
      extrasStats,
      calculateUniqueWards,
    } = await this.calculateAllStats();

    const generalStats = [
      {
        name: 'total_respondents',
        data: total,
        group: 'beneficiary',
      },
      {
        name: 'total_number_family_members',
        data: calculateTotalFamilyMembers,
        group: 'beneficiary',
      },
      {
        name: 'beneficiary_gender',
        data: gender,
        group: 'beneficiary',
      },
      {
        name: 'beneficiary_countByBank',
        data: countByBank,
        group: 'beneficiary',
      },
      {
        name: 'type_of_ssa',
        data: calculateTypeOfSSA,
        group: 'beneficiary',
      },
      {
        name: 'beneficiary_ageGroups',
        data: calculateAgeGroups,
        group: 'beneficiary',
      },
      {
        name: 'field_map_result',
        data: fieldMapResult,
        group: 'beneficiary',
      },
      {
        name: 'channel_usage_stats',
        data: calculateChannelUsageStats,
        group: 'beneficiary_channel',
      },
      {
        name: 'type_of_phone',
        data: phoneTypeDistribution,
        group: 'beneficiary',
      },

      {
        name: 'unique_wards',
        data: calculateUniqueWards,
        group: 'wards',
      },
    ];

    const allStats = [
      ...generalStats,
      ...calculateBeneflocationStats,
      ...extrasStats,
    ];

    await this.statsService.saveMany(allStats);

    return {
      total,
      gender,
      countByBank,
      calculateAgeGroups,
      fieldMapResult,
      locationStats: calculateBeneflocationStats,
      calculateChannelUsageStats,
      phoneTypeDistribution,
      ...extrasStats,
      calculateUniqueWards,
    };
  }
}
