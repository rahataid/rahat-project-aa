import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '@rumsan/prisma';
import { CORE_MODULE } from '../constants';
import { ClientProxy } from '@nestjs/microservices';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';
import { of } from 'rxjs';

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
    beneficiaryGroups: {
      findMany: jest.fn(),
    },
    beneficiaryRedeem: {
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

      const mockBeneficiaryRedeems = [
        {
          beneficiaryWalletAddress: 'wallet-1',
          vendorUid: 'test-vendor-uuid',
          transactionType: 'VENDOR_REIMBURSEMENT',
          Beneficiary: {
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
          beneficiaryWalletAddress: 'wallet-2',
          vendorUid: 'test-vendor-uuid',
          transactionType: 'VENDOR_REIMBURSEMENT',
          Beneficiary: {
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

      const mockBeneficiaryResponse = [
        { uuid: 'ben-1', name: 'John Doe' },
        { uuid: 'ben-2', name: 'Jane Smith' },
      ];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(mockBeneficiaryRedeems);
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        ...mockBeneficiaryRedeems[0].Beneficiary,
        name: 'John Doe',
      });
      expect(result.data[1]).toEqual({
        ...mockBeneficiaryRedeems[1].Beneficiary,
        name: 'Jane Smith',
      });
      expect(result.meta.total).toBe(2);

      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'test-vendor-uuid' },
      });

      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith({
        where: {
          transactionType: 'VENDOR_REIMBURSEMENT',
          vendorUid: 'test-vendor-uuid',
        },
        include: {
          Beneficiary: {
            select: {
              uuid: true,
              walletAddress: true,
              phone: true,
              gender: true,
              benTokens: true,
              isVerified: true,
              createdAt: true,
            },
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

      const mockGroups = [
        {
          uuid: 'group-1',
          name: 'Test Group',
          groupPurpose: 'BANK_TRANSFER',
        },
      ];

      const mockBeneficiaryToGroups = [
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

      const mockBeneficiaryResponse = [
        { uuid: 'ben-1', name: 'John Doe' },
      ];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(mockGroupTokens);
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(mockGroups);
      mockPrismaService.beneficiaryToGroup.findMany.mockResolvedValue(mockBeneficiaryToGroups);
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        ...mockBeneficiaryToGroups[0].beneficiary,
        name: 'John Doe',
      });
      expect(result.meta.total).toBe(1);

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

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith({
        where: {
          uuid: { in: ['group-1'] },
          groupPurpose: { not: 'COMMUNICATION' },
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
        payoutMode: PayoutMode.OFFLINE,
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

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
