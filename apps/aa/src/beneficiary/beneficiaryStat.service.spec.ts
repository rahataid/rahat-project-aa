import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { PrismaService } from '@rumsan/prisma';
import { StatsService } from '../stats';

describe('BeneficiaryStatService', () => {
  let service: BeneficiaryStatService;
  let prismaService: PrismaService;
  let statsService: StatsService;

  const mockPrismaService = {
    beneficiary: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockStatsService = {
    save: jest.fn(),
    saveMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeneficiaryStatService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
      ],
    }).compile();

    service = module.get<BeneficiaryStatService>(BeneficiaryStatService);
    prismaService = module.get<PrismaService>(PrismaService);
    statsService = module.get<StatsService>(StatsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('totalBeneficiaries', () => {
    it('should return total count of non-deleted beneficiaries', async () => {
      mockPrismaService.beneficiary.count.mockResolvedValue(100);

      const result = await service.totalBeneficiaries();

      expect(result).toEqual({ count: 100 });
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });
  });

  describe('countExtrasFieldValuesNormalized', () => {
    it('should normalize values, ignore unexpected and count expected', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { some_field: ' Yes ' } },
        { extras: { some_field: 'NO' } },
        { extras: { some_field: 'yes' } },
        { extras: { some_field: 'maybe' } },
        { extras: { other: 'yes' } },
      ]);
      const res = await service.countExtrasFieldValuesNormalized('some_field', [
        'yes',
        'no',
      ]);
      expect(res).toEqual([
        { id: 'Yes', count: 2 },
        { id: 'No', count: 1 },
      ]);
    });
  });

  describe('calculateGenderStats', () => {
    it('should return gender statistics', async () => {
      const mockGenderStats = [
        { gender: 'MALE', _count: { gender: 60 } },
        { gender: 'FEMALE', _count: { gender: 40 } },
      ];

      mockPrismaService.beneficiary.groupBy.mockResolvedValue(mockGenderStats);

      const result = await service.calculateGenderStats();

      expect(result).toEqual([
        { id: 'MALE', count: 60 },
        { id: 'FEMALE', count: 40 },
      ]);
      expect(mockPrismaService.beneficiary.groupBy).toHaveBeenCalledWith({
        by: ['gender'],
        _count: { gender: true },
      });
    });
  });

  describe('calculateVulnerabilityStats', () => {
    it('should return vulnerability statistics', async () => {
      mockPrismaService.beneficiary.count
        .mockResolvedValueOnce(30) // Vulnerable count
        .mockResolvedValueOnce(70); // Not vulnerable count

      const result = await service.calculateVulnerabilityStats();

      expect(result).toEqual([
        { id: 'Vulnerable', count: 30 },
        { id: 'Not_Vulnerable', count: 70 },
      ]);
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('countByBank', () => {
    it('should count bank occurrences', () => {
      const data = [
        { extras: { bank_name: 'Bank A' } },
        { extras: { bank_name: 'Bank A' } },
        { extras: { bank_name: 'Bank B' } },
        { extras: { bank_name: null } },
      ];
      // @ts-ignore private-ish method test
      const res = service.countByBank(data);
      expect(res).toEqual({ 'Bank A': 2, 'Bank B': 1 });
    });
  });

  describe('calculateCountByBankStats', () => {
    it('should return bank count statistics', async () => {
      const mockBeneficiaries = [
        { uuid: '1', extras: { bank_name: 'Bank A' } },
        { uuid: '2', extras: { bank_name: 'Bank A' } },
        { uuid: '3', extras: { bank_name: 'Bank B' } },
      ];

      mockPrismaService.beneficiary.findMany.mockResolvedValue(mockBeneficiaries);

      const result = await service.calculateCountByBankStats();

      expect(result).toEqual([
        { id: 'Bank A', count: 2 },
        { id: 'Bank B', count: 1 },
      ]);
    });
  });

  describe('filterAndCountPhoneStatus', () => {
    it('should count phoned vs unphoned', () => {
      const data = [
        { extras: { phone: '9991112222' } },
        { extras: { phone: '1234567890' } },
        { extras: { phone: '9990000000' } },
        { extras: { phone: '8880000000' } },
      ];
      // @ts-ignore
      const res = service.filterAndCountPhoneStatus(data);
      expect(res).toEqual([
        { id: 'Phoned', count: 2 },
        { id: 'UnPhoned', count: 2 },
      ]);
    });
  });

  describe('calculatePhoneStatusStats', () => {
    it('should return phone status statistics', async () => {
      const mockBeneficiaries = [
        { uuid: '1', extras: { phone: '9999999999' } },
        { uuid: '2', extras: { phone: '1234567890' } },
        { uuid: '3', extras: { phone: '9998887777' } },
      ];

      mockPrismaService.beneficiary.findMany.mockResolvedValue(mockBeneficiaries);

      const result = await service.calculatePhoneStatusStats();

      expect(result).toEqual([
        { id: 'Phoned', count: 1 },
        { id: 'UnPhoned', count: 2 },
      ]);
    });
  });

  describe('calculateVulnerabilityCountStats', () => {
    it('should map vulnerability counts correctly', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { if_yes_how_many_lactating: '2', if_yes_how_many_pregnant: '1', type_of_ssa_1: 'A' } },
        { extras: { if_yes_how_many_lactating: '1', type_of_ssa_2: 'B' } },
        { extras: { if_yes_how_many_pregnant: '3', type_of_ssa_3: 'A' } },
      ]);
      const res = await service.calculateVulnerabilityCountStats();
      // Order not guaranteed so just ensure contents
      expect(res).toEqual(
        expect.arrayContaining([
          { id: 'Lactating', count: 3 },
          { id: 'Pregnant', count: 4 },
          { id: 'A', count: 2 },
          { id: 'B', count: 1 },
        ])
      );
    });
  });

  describe('calculateTypeOfSSA', () => {
    it('should count type_of_ssa values ignoring dash and missing', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { type_of_ssa: 'senior_citizen__70' } },
        { extras: { type_of_ssa: 'senior_citizen__70' } },
        { extras: { type_of_ssa: 'child_nutrition' } },
        { extras: { type_of_ssa: '-' } },
        { extras: { } },
      ]);
      const res = await service.calculateTypeOfSSA();
      const senior = res.find(r => r.id === 'senior_citizen__70');
      const child = res.find(r => r.id === 'child_nutrition');
      expect(senior?.count).toBe(2);
      expect(child?.count).toBe(1);
    });
  });

  describe('calculateBeneflocationStats', () => {
    it('should build location stats with valid gps & ward only', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { ward_no: 1, gps: '27.1 85.1' } },
        { extras: { ward_no: 1, gps: '27.2 85.2' } },
        { extras: { ward_no: 2, gps: 'invalid gps' } },
        { extras: { ward_no: null, gps: '27.3 85.3' } },
      ]);
      const res = await service.calculateBeneflocationStats();
      expect(res).toEqual([
        {
          name: 'WARD1',
          group: 'beneficiary_gps_location',
          data: {
            count: 2,
            locations: [
              { lat: 27.1, long: 85.1 },
              { lat: 27.2, long: 85.2 },
            ],
          },
        },
      ]);
    });
  });

  describe('calculateHouseholdCashSupport', () => {
    it('should count beneficiaries with benTokens > 0', async () => {
      mockPrismaService.beneficiary.count.mockResolvedValueOnce(5);
      const res = await service.calculateHouseholdCashSupport();
      expect(res).toBe(5);
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledWith({
        where: { benTokens: { gt: 0 } },
      });
    });
  });

  describe('calculateAgeGroups', () => {
    it('should map ages into groups', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { interviewee_age: 18 } },
        { extras: { interviewee_age: 25 } },
        { extras: { interviewee_age: 35 } },
        { extras: { interviewee_age: 50 } },
        { extras: { interviewee_age: 70 } },
        { extras: { interviewee_age: 'NaN' } },
      ]);
      const res = await service.calculateAgeGroups();
      expect(res).toEqual([
        { id: '<20', count: 1 },
        { id: '20-29', count: 1 },
        { id: '30-45', count: 1 },
        { id: '46-59', count: 1 },
        { id: '>60', count: 1 },
      ]);
    });
  });

  describe('calculateTotalFamilyMembers', () => {
    it('should sum total_number_of_family_members', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { total_number_of_family_members: 3 } },
        { extras: { total_number_of_family_members: 0 } },
        { extras: { total_number_of_family_members: 2 } },
        { extras: { } },
      ]);
      const res = await service.calculateTotalFamilyMembers();
      expect(res).toEqual({ count: 5 });
    });
  });

  describe('fieldMapResult', () => {
    it('should aggregate vulnerable field counts', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { no_of_lactating_women: '2', no_of_pregnant_women: '1', no_of_persons_with_disability: '-' } },
        { extras: { no_of_lactating_women: '1', no_of_pregnant_women: '', no_of_persons_with_disability: '3' } },
      ]);
      const res = await service.fieldMapResult();
      expect(res).toEqual({
        no_of_lactating_women: 3,
        no_of_persons_with_disability: 3,
        no_of_pregnant_women: 1,
      });
    });
  });

  describe('calculateChannelUsageStats', () => {
    it('should aggregate channel usage', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { channelcommunity: 1, channelfm_radio: 0, channelmobile_phone___sms: 1, channelnewspaper: 1 } },
        { extras: { channelcommunity: 0, channelfm_radio: 1, channelmobile_phone___sms: 1, channelnewspaper: 0 } },
      ] as any);
      const res = await service.calculateChannelUsageStats();
      const getById = (id: string) => res.find(r => r.id === id);
      const community = getById('Community');
      const fmRadio = getById('FmRadio');
      const newspaper = getById('Newspaper');
      const smsEntry = getById('MobilePhoneSms');
      expect(community?.count).toBe(1);
      expect(fmRadio?.count).toBe(1);
      expect(smsEntry?.count).toBe(2);
      expect(newspaper?.count).toBe(1);
    });
  });

  describe('phoneTypeDistribution', () => {
    it('should combine keypad and brick counts', async () => {
      // countExtrasFieldValuesNormalized is used internally; spy & mock result
      jest.spyOn(service, 'countExtrasFieldValuesNormalized').mockResolvedValue([
        { id: 'Smartphone', count: 5 },
        { id: 'Keypad', count: 2 },
        { id: 'Brick', count: 3 },
        { id: 'Both', count: 1 },
      ]);
      const res = await service.phoneTypeDistribution();
      expect(res).toEqual([
        { id: 'Smartphone', count: 5 },
        { id: 'Both', count: 1 },
        { id: 'Keypad/Brick', count: 5 },
      ]);
    });
  });

  describe('calculateUniqueWards', () => {
    it('should return sorted unique ward numbers', async () => {
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        { extras: { ward_no: 5 } },
        { extras: { ward_no: 3 } },
        { extras: { ward_no: 3 } },
        { extras: { ward_no: null } },
      ]);
      const res = await service.calculateUniqueWards();
      expect(res).toEqual([{ ward: 3 }, { ward: 5 }]);
    });
  });

  describe('getExtrasStats', () => {
    it('should return normalized yes/no stats for each extras key', async () => {
      // For simplicity mock countExtrasFieldValuesNormalized
      const spy = jest
        .spyOn(service, 'countExtrasFieldValuesNormalized')
        .mockResolvedValueOnce([
          { id: 'Yes', count: 1 },
          { id: 'No', count: 0 },
        ])
        .mockResolvedValue([
          { id: 'Yes', count: 2 },
          { id: 'No', count: 3 },
        ]);
      const res = await service.getExtrasStats();
      expect(res[0].group).toBe('beneficiary');
      expect(spy).toHaveBeenCalled();
      // Ensure structure
      res.forEach(r => {
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('data');
        expect(r).toHaveProperty('group');
      });
    });
  });

  describe('calculateAllStats', () => {
    it('should return all statistics', async () => {
      // Mock all individual stat methods that are invoked inside calculateAllStats
      jest.spyOn(service, 'totalBeneficiaries').mockResolvedValue({ count: 100 });
      jest.spyOn(service, 'calculateGenderStats').mockResolvedValue([
        { id: 'MALE', count: 60 },
        { id: 'FEMALE', count: 40 },
      ]);
      jest.spyOn(service, 'calculateCountByBankStats').mockResolvedValue([
        { id: 'Bank A', count: 2 },
        { id: 'Bank B', count: 1 },
      ]);
      jest.spyOn(service, 'calculateAgeGroups').mockResolvedValue([
        { id: '<20', count: 0 },
        { id: '20-29', count: 0 },
        { id: '30-45', count: 0 },
        { id: '46-59', count: 0 },
        { id: '>60', count: 0 },
      ]);
      jest.spyOn(service, 'calculateTotalFamilyMembers').mockResolvedValue({
        count: 0,
      });
      jest.spyOn(service, 'calculateTypeOfSSA').mockResolvedValue([
        { id: 'senior_citizen__70', count: 0 },
        { id: 'senior_citizen__60__dalit', count: 0 },
        { id: 'child_nutrition', count: 0 },
        { id: 'single_woman', count: 0 },
        { id: 'widow', count: 0 },
        { id: 'red_class', count: 0 },
        { id: 'blue_card', count: 0 },
        { id: 'indigenous_community', count: 0 },
      ]);
      jest.spyOn(service, 'fieldMapResult').mockResolvedValue({
        no_of_lactating_women: 0,
        no_of_persons_with_disability: 0,
        no_of_pregnant_women: 0,
      });
      // Newly added/stat methods in service
      jest.spyOn(service, 'calculateBeneflocationStats').mockResolvedValue([]);
      jest.spyOn(service, 'calculateChannelUsageStats').mockResolvedValue([]);
      jest.spyOn(service, 'phoneTypeDistribution').mockResolvedValue([]);
      jest.spyOn(service, 'getExtrasStats').mockResolvedValue([]);
      jest.spyOn(service, 'calculateUniqueWards').mockResolvedValue([]);

      const result = await service.calculateAllStats();

      expect(result).toEqual({
        total: { count: 100 },
        gender: [
          { id: 'MALE', count: 60 },
          { id: 'FEMALE', count: 40 },
        ],
        countByBank: [
          { id: 'Bank A', count: 2 },
          { id: 'Bank B', count: 1 },
        ],
        calculateAgeGroups: [
          { id: '<20', count: 0 },
          { id: '20-29', count: 0 },
          { id: '30-45', count: 0 },
          { id: '46-59', count: 0 },
          { id: '>60', count: 0 },
        ],
        calculateTotalFamilyMembers: { count: 0 },
        calculateTypeOfSSA: [
          { id: 'senior_citizen__70', count: 0 },
          { id: 'senior_citizen__60__dalit', count: 0 },
          { id: 'child_nutrition', count: 0 },
          { id: 'single_woman', count: 0 },
          { id: 'widow', count: 0 },
          { id: 'red_class', count: 0 },
          { id: 'blue_card', count: 0 },
          { id: 'indigenous_community', count: 0 },
        ],
        fieldMapResult: {
          no_of_lactating_women: 0,
          no_of_persons_with_disability: 0,
          no_of_pregnant_women: 0,
        },
        calculateBeneflocationStats: [],
        calculateChannelUsageStats: [],
        phoneTypeDistribution: [],
        extrasStats: [],
        calculateUniqueWards: [],
      });
    });
  });

  describe('saveAllStats', () => {
    it('should call saveMany and return combined result', async () => {
      const calcAll = {
        total: { count: 1 },
        gender: [{ id: 'MALE', count: 1 }],
        countByBank: [],
        calculateAgeGroups: [],
        calculateTotalFamilyMembers: { count: 0 },
        calculateTypeOfSSA: [],
        fieldMapResult: {},
        calculateBeneflocationStats: [],
        calculateChannelUsageStats: [],
        phoneTypeDistribution: [],
        extrasStats: [
          { name: 'dummy', data: [], group: 'beneficiary' },
        ],
        calculateUniqueWards: [],
      } as any;
      jest
        .spyOn(service, 'calculateAllStats')
        .mockResolvedValue(calcAll);
      const res = await service.saveAllStats();
      expect(mockStatsService.saveMany).toHaveBeenCalled();
      expect(res.total).toEqual({ count: 1 });
      expect(res.gender).toEqual([{ id: 'MALE', count: 1 }]);
      // extrasStats spread should appear as numeric keys
      expect(res['0']).toEqual({ name: 'dummy', data: [], group: 'beneficiary' });
    });
  });
});
