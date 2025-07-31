import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '@rumsan/prisma';
import { CORE_MODULE } from '../constants';
import { ClientProxy } from '@nestjs/microservices';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';

describe('VendorsService', () => {
  let service: VendorsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    vendor: {
      findUnique: jest.fn(),
    },
    payouts: {
      findMany: jest.fn(),
    },
    beneficiaryGroupTokens: {
      findMany: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
    },
  };

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockReceiveService = {
    getAccountBalance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CORE_MODULE,
          useValue: mockClientProxy,
        },
        {
          provide: ReceiveService,
          useValue: mockReceiveService,
        },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getVendorBeneficiaries', () => {
    it('should return beneficiaries for ONLINE payout mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      const mockVendor = {
        uuid: 'test-vendor-uuid',
        name: 'Test Vendor',
        walletAddress: 'test-wallet',
      };

      const mockPayouts = [
        {
          uuid: 'payout-1',
          type: 'VENDOR',
          mode: 'ONLINE',
        },
        {
          uuid: 'payout-2',
          type: 'VENDOR',
          mode: 'ONLINE',
        },
      ];

      const mockGroupTokens = [
        {
          groupId: 'group-1',
          payoutId: 'payout-1',
        },
        {
          groupId: 'group-2',
          payoutId: 'payout-2',
        },
      ];

      const mockBeneficiaries = [
        {
          beneficiary: {
            uuid: 'ben-1',
            walletAddress: 'wallet-1',
            phone: '1234567890',
            gender: 'MALE',
            benTokens: 100,
            isVerified: true,
            createdAt: new Date(),
          },
        },
        {
          beneficiary: {
            uuid: 'ben-2',
            walletAddress: 'wallet-2',
            phone: '0987654321',
            gender: 'FEMALE',
            benTokens: 200,
            isVerified: false,
            createdAt: new Date(),
          },
        },
      ];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
        mockGroupTokens
      );
      mockPrismaService.beneficiaryToGroup.findMany.mockResolvedValue(
        mockBeneficiaries
      );

      const result = await service.getVendorBeneficiaries(payload);

      expect(result).toEqual({
        data: mockBeneficiaries.map((b) => b.beneficiary),
        meta: {
          page: 1,
          perPage: 20,
          total: 2,
          totalPages: 1,
        },
      });

      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'test-vendor-uuid' },
      });

      expect(mockPrismaService.payouts.findMany).toHaveBeenCalledWith({
        where: {
          type: 'VENDOR',
          mode: 'ONLINE',
          beneficiaryGroupToken: {
            isNot: null,
          },
        },
      });
    });

    it('should return beneficiaries for OFFLINE payout mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.OFFLINE,
        page: 1,
        perPage: 20,
      };

      const mockVendor = {
        uuid: 'test-vendor-uuid',
        name: 'Test Vendor',
        walletAddress: 'test-wallet',
      };

      const mockPayouts = [
        {
          uuid: 'payout-1',
          type: 'VENDOR',
          mode: 'OFFLINE',
          payoutProcessorId: 'test-vendor-uuid',
        },
      ];

      const mockGroupTokens = [
        {
          groupId: 'group-1',
          payoutId: 'payout-1',
        },
      ];

      const mockBeneficiaries = [
        {
          beneficiary: {
            uuid: 'ben-1',
            walletAddress: 'wallet-1',
            phone: '1234567890',
            gender: 'MALE',
            benTokens: 100,
            isVerified: true,
            createdAt: new Date(),
          },
        },
      ];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
        mockGroupTokens
      );
      mockPrismaService.beneficiaryToGroup.findMany.mockResolvedValue(
        mockBeneficiaries
      );

      const result = await service.getVendorBeneficiaries(payload);

      expect(result).toEqual({
        data: mockBeneficiaries.map((b) => b.beneficiary),
        meta: {
          page: 1,
          perPage: 20,
          total: 1,
          totalPages: 1,
        },
      });

      expect(mockPrismaService.payouts.findMany).toHaveBeenCalledWith({
        where: {
          type: 'VENDOR',
          mode: 'OFFLINE',
          payoutProcessorId: 'test-vendor-uuid',
          beneficiaryGroupToken: {
            isNot: null,
          },
        },
      });
    });

    it('should throw error when vendor not found', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'non-existent-vendor',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(service.getVendorBeneficiaries(payload)).rejects.toThrow(
        'Vendor with id non-existent-vendor not found'
      );
    });

    it('should return empty result when no payouts found', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      const mockVendor = {
        uuid: 'test-vendor-uuid',
        name: 'Test Vendor',
        walletAddress: 'test-wallet',
      };

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result).toEqual({
        data: [],
        meta: {
          page: 1,
          perPage: 20,
          total: 0,
          totalPages: 0,
        },
      });
    });
  });
});
