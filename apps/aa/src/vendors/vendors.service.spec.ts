import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '@rumsan/prisma';
import { CORE_MODULE, BQUEUE } from '../constants';
import { ClientProxy } from '@nestjs/microservices';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';
import { of } from 'rxjs';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

describe('VendorsService', () => {
  let service: VendorsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    vendor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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
      aggregate: jest.fn(),
    },
    otp: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    beneficiary: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockReceiveService = {
    getAccountBalance: jest.fn(),
  };

  const mockVendorOfflineQueue = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockBatchTransferQueue = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockVendorCVAPayoutQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
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
        {
          provide: getQueueToken(BQUEUE.VENDOR_OFFLINE),
          useValue: mockVendorOfflineQueue,
        },
        {
          provide: getQueueToken(BQUEUE.BATCH_TRANSFER),
          useValue: mockBatchTransferQueue,
        },
        {
          provide: getQueueToken(BQUEUE.VENDOR_CVA),
          useValue: mockVendorCVAPayoutQueue,
        },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listWithProjectData', () => {
    it('should return paginated vendors with search', async () => {
      const query = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc' as const,
        search: 'test',
      };

      const mockVendors = [
        { id: 1, uuid: 'vendor-1', name: 'Test Vendor 1' },
        { id: 2, uuid: 'vendor-2', name: 'Test Vendor 2' },
      ];

      Object.assign(mockPrismaService.vendor, {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue(mockVendors),
      });

      const result = await service.listWithProjectData(query);

      expect(result.data).toEqual(mockVendors);
      expect(mockPrismaService.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            name: { contains: 'test', mode: 'insensitive' },
          },
          orderBy: { name: 'asc' },
        })
      );
    });

    it('should handle empty search', async () => {
      const query = {
        page: 1,
        perPage: 20,
        sort: 'createdAt',
        order: 'desc' as const,
      };

      Object.assign(mockPrismaService.vendor, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.listWithProjectData(query);

      expect(result.data).toEqual([]);
      expect(mockPrismaService.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            name: { contains: undefined, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('findOne', () => {
    it('should return a vendor by uuid', async () => {
      const uuid = 'vendor-uuid-123';
      const mockVendor = {
        id: 1,
        uuid,
        name: 'Test Vendor',
        walletAddress: 'wallet-address',
      };

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);

      const result = await service.findOne(uuid);

      expect(result).toEqual(mockVendor);
      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid },
      });
    });

    it('should return null if vendor not found', async () => {
      const uuid = 'non-existent-uuid';
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      const result = await service.findOne(uuid);

      expect(result).toBeNull();
    });
  });

  describe('getVendorWalletStats', () => {
    it('should return vendor wallet stats successfully', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const mockVendor = {
        uuid: 'vendor-123',
        walletAddress: 'vendor-wallet-address',
        name: 'Test Vendor',
      };

      const mockBalance = [
        { asset_code: 'XLM', balance: '1000' },
        { asset_code: 'RAHAT', balance: '500' },
      ];

      const mockTransactions = [
        {
          beneficiaryWalletAddress: 'ben-wallet-1',
          amount: 100,
          transactionType: 'VOUCHER',
          createdAt: new Date(),
          txHash: 'tx-hash-123',
        },
      ];

      const mockBenResponse = [
        {
          walletAddress: 'ben-wallet-1',
          piiData: { name: 'John Doe' },
        },
      ];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockReceiveService.getAccountBalance.mockResolvedValue(mockBalance);
      mockPrismaService.payouts.findMany.mockResolvedValue([
        {
          beneficiaryGroupToken: { numberOfTokens: 1000 },
        },
      ]);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockTransactions
      );
      mockClientProxy.send.mockReturnValue(of(mockBenResponse));

      // Mock the private methods via spies
      jest.spyOn(service, 'getVendorAssignedTokens').mockResolvedValue(1000);
      jest.spyOn(service, 'getVendorAssignedBalance').mockResolvedValue(500);
      // Mock the private method using any type to avoid TypeScript errors
      (service as any).getRecentTransactionDb = jest.fn().mockResolvedValue([]);

      const result = await service.getVendorWalletStats(vendorWallet);

      expect(result).toEqual({
        assignedTokens: 1000,
        disbursedTokens: 1000,
        vendorAssignedBalance: 500,
        balances: mockBalance,
        transactions: expect.any(Array),
        createdAt: undefined,
        updatedAt: undefined,
        vendorAssignedBalance: 1000,
      });
    });

    it('should throw error if vendor not found', async () => {
      const vendorWallet = { uuid: 'non-existent', take: 10, skip: 0 };
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(service.getVendorWalletStats(vendorWallet)).rejects.toThrow(
        'Vendor with id non-existent not found'
      );
    });

    it('should throw error if balance fetch fails', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const mockVendor = {
        uuid: 'vendor-123',
        walletAddress: 'vendor-wallet-address',
      };

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockReceiveService.getAccountBalance.mockResolvedValue(null);

      await expect(service.getVendorWalletStats(vendorWallet)).rejects.toThrow(
        'Failed to get balance for vendor with id vendor-123'
      );
    });

    it('should handle errors in getVendorWalletStats', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const error = new Error('Database error');

      mockPrismaService.vendor.findUnique.mockRejectedValue(error);

      await expect(service.getVendorWalletStats(vendorWallet)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getVendorAssignedTokens', () => {
    it('should return assigned tokens for vendor (not disbursed)', async () => {
      const vendorUuid = 'vendor-123';
      const mockPayouts = [
        { beneficiaryGroupToken: { numberOfTokens: 500 } },
        { beneficiaryGroupToken: { numberOfTokens: 300 } },
      ];

      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);

      const result = await service.getVendorAssignedTokens(vendorUuid, false);

      expect(result).toBe(800);
      expect(mockPrismaService.payouts.findMany).toHaveBeenCalledWith({
        where: {
          type: 'VENDOR',
          payoutProcessorId: vendorUuid,
        },
        include: {
          beneficiaryGroupToken: true,
        },
      });
    });

    it('should return disbursed tokens for vendor', async () => {
      const vendorUuid = 'vendor-123';
      const mockPayouts = [{ beneficiaryGroupToken: { numberOfTokens: 200 } }];

      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);

      const result = await service.getVendorAssignedTokens(vendorUuid, true);

      expect(result).toBe(200);
      expect(mockPrismaService.payouts.findMany).toHaveBeenCalledWith({
        where: {
          type: 'VENDOR',
          payoutProcessorId: vendorUuid,
          beneficiaryGroupToken: {
            isDisbursed: true,
          },
        },
        include: {
          beneficiaryGroupToken: true,
        },
      });
    });

    it('should handle errors in getVendorAssignedTokens', async () => {
      const vendorUuid = 'vendor-123';
      const error = new Error('Database error');

      mockPrismaService.payouts.findMany.mockRejectedValue(error);

      await expect(service.getVendorAssignedTokens(vendorUuid)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getRedemptionRequest', () => {
    it('should return redemption requests for vendor', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const mockRedemptions = [
        {
          uuid: 'redeem-1',
          vendorUid: 'vendor-123',
          amount: 100,
        },
        {
          uuid: 'redeem-2',
          vendorUid: 'vendor-123',
          amount: 200,
        },
      ];

      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedemptions
      );

      const result = await service.getRedemptionRequest(vendorWallet);

      expect(result).toEqual(mockRedemptions);
      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        {
          where: {
            vendorUid: 'vendor-123',
          },
          take: 10,
          skip: 0,
        }
      );
    });

    it('should use default take and skip values', async () => {
      const vendorWallet = { uuid: 'vendor-123' };
      const mockRedemptions = [{ uuid: 'redeem-1', vendorUid: 'vendor-123' }];

      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedemptions
      );

      await service.getRedemptionRequest(vendorWallet);

      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        {
          where: {
            vendorUid: 'vendor-123',
          },
          take: 10,
          skip: 0,
        }
      );
    });

    it('should throw error when no redemption requests found', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      await expect(service.getRedemptionRequest(vendorWallet)).rejects.toThrow(
        'No redemption requests found for vendor'
      );
    });

    it('should handle errors in getRedemptionRequest', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const error = new Error('Database error');

      mockPrismaService.beneficiaryRedeem.findMany.mockRejectedValue(error);

      await expect(service.getRedemptionRequest(vendorWallet)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getTxnAndRedemptionList', () => {
    it('should return paginated transactions and redemptions', async () => {
      const payload = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };

      const mockTransactions = [
        {
          uuid: 'txn-1',
          vendorUid: 'vendor-123',
          amount: 100,
          createdAt: new Date(),
        },
      ];

      Object.assign(mockPrismaService.beneficiaryRedeem, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(mockTransactions),
      });

      const result = await service.getTxnAndRedemptionList(payload);

      // Updated expectation to account for Beneficiary enrichment performed by service
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        ...mockTransactions[0],
        Beneficiary: { phone: null, name: null },
      });
      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vendorUid: 'vendor-123',
            status: 'COMPLETED',
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      );
    });

    it('should filter by txHash when provided', async () => {
      const payload = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
        txHash: 'tx-hash-123',
      };

      Object.assign(mockPrismaService.beneficiaryRedeem, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      await service.getTxnAndRedemptionList(payload);

      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vendorUid: 'vendor-123',
            status: 'COMPLETED',
            txHash: 'tx-hash-123',
          },
        })
      );
    });

    it('should filter by success status when provided', async () => {
      const payload = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
        status: 'success',
      };

      Object.assign(mockPrismaService.beneficiaryRedeem, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      await service.getTxnAndRedemptionList(payload);

      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vendorUid: 'vendor-123',
            status: 'COMPLETED',
          },
        })
      );
    });

    it('should handle errors in getTxnAndRedemptionList', async () => {
      const payload = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };

      const error = new Error('Database error');
      mockPrismaService.beneficiaryRedeem.findMany.mockRejectedValue(error);

      await expect(service.getTxnAndRedemptionList(payload)).rejects.toThrow(
        'Database error'
      );
    });
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
          amount: 100,
          txHash: 'tx-hash-1',
          status: 'COMPLETED',
          info: {},
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
          amount: 200,
          txHash: 'tx-hash-2',
          status: 'COMPLETED',
          info: {},
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
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockBeneficiaryRedeems
      );
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        ...mockBeneficiaryRedeems[0].Beneficiary,
        name: 'John Doe',
        txHash: 'tx-hash-1',
        status: 'COMPLETED',
        benTokens: 100,
      });
      expect(result.data[1]).toMatchObject({
        ...mockBeneficiaryRedeems[1].Beneficiary,
        name: 'Jane Smith',
        txHash: 'tx-hash-2',
        status: 'COMPLETED',
        benTokens: 200,
      });
      expect(result.meta.total).toBe(2);

      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'test-vendor-uuid' },
      });

      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            transactionType: 'VENDOR_REIMBURSEMENT',
            vendorUid: 'test-vendor-uuid',
            status: 'COMPLETED',
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
          orderBy: { createdAt: 'desc' },
          take: 20,
          skip: 0,
        }
      );
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockBeneficiaryRedeems = [
        {
          beneficiaryWalletAddress: 'wallet-1',
          vendorUid: 'test-vendor-uuid',
          transactionType: 'VENDOR_REIMBURSEMENT',
          amount: 100,
          status: 'PENDING',
          txHash: null,
          info: { mode: 'OFFLINE' },
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
      ];

      const mockBeneficiaryResponse = [{ uuid: 'ben-1', name: 'John Doe' }];

      // Set up mocks after clearAllMocks
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockBeneficiaryRedeems
      );
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));
      
      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        ...mockBeneficiaryRedeems[0].Beneficiary,
        name: 'John Doe',
        benTokens: 100, // This comes from redeem.amount
        txHash: null,
        status: 'PENDING',
        info: { mode: 'OFFLINE' },
      });
      expect(result.meta.total).toBe(1);

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
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
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
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty result when no group tokens found in OFFLINE mode', async () => {
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
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue([]);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return empty result when no payout-eligible groups found in OFFLINE mode', async () => {
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
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
        mockGroupTokens
      );
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([]);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle ONLINE mode with empty beneficiary UUIDs', async () => {
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
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle OFFLINE mode with empty beneficiary UUIDs', async () => {
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

      const mockPayouts = [{ uuid: 'payout-1' }];
      const mockGroupTokens = [{ groupId: 'group-1', payoutId: 'payout-1' }];
      const mockGroups = [{ uuid: 'group-1', groupPurpose: 'BANK_TRANSFER' }];

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
        mockGroupTokens
      );
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(
        mockGroups
      );
      mockPrismaService.beneficiaryToGroup.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle invalid payout mode by treating it as OFFLINE', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: 'INVALID' as any,
        page: 1,
        perPage: 20,
      };

      const mockVendor = {
        uuid: 'test-vendor-uuid',
        name: 'Test Vendor',
        walletAddress: 'test-wallet',
      };

      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('should handle errors in getVendorBeneficiaries', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      const error = new Error('Database error');
      mockPrismaService.vendor.findUnique.mockRejectedValue(error);

      await expect(service.getVendorBeneficiaries(payload)).rejects.toThrow(
        'Database error'
      );
    });
  });
});
