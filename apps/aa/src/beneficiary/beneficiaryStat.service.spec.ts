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

  describe('calculateBankStatusStats', () => {
    it('should return bank status statistics', async () => {
      mockPrismaService.beneficiary.count
        .mockResolvedValueOnce(80) // Banked count
        .mockResolvedValueOnce(20); // Unbanked count

      const result = await service.calculateBankStatusStats();

      expect(result).toEqual([
        { id: 'Banked', count: 80 },
        { id: 'Unbanked', count: 20 },
      ]);
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculatePhoneSetTypeStats', () => {
    it('should return phone set type statistics', async () => {
      mockPrismaService.beneficiary.count
        .mockResolvedValueOnce(65) // Smart phone count
        .mockResolvedValueOnce(35); // Simple mobile count

      const result = await service.calculatePhoneSetTypeStats();

      expect(result).toEqual([
        { id: 'Smart_Phone_Set', count: 65 },
        { id: 'Simple_Mobile_Set', count: 35 },
      ]);
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledTimes(2);
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

  describe('calculateAllStats', () => {
    it('should return all statistics', async () => {
      // Mock all individual stat methods
      jest.spyOn(service, 'totalBeneficiaries').mockResolvedValue({ count: 100 });
      jest.spyOn(service, 'calculateGenderStats').mockResolvedValue([
        { id: 'MALE', count: 60 },
        { id: 'FEMALE', count: 40 },
      ]);
      jest.spyOn(service, 'calculateBankStatusStats').mockResolvedValue([
        { id: 'Banked', count: 80 },
        { id: 'Unbanked', count: 20 },
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

      const result = await service.calculateAllStats();

      expect(result).toEqual({
        total: { count: 100 },
        gender: [
          { id: 'MALE', count: 60 },
          { id: 'FEMALE', count: 40 },
        ],
        bankStatus: [
          { id: 'Banked', count: 80 },
          { id: 'Unbanked', count: 20 },
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
        calculateTotalFamilyMembers: {
          count: 0,
        },
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
      });
    });
  });
}); 