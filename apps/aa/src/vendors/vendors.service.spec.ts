import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '@rumsan/prisma';
import { CORE_MODULE, BQUEUE } from '../constants';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';
import { of } from 'rxjs';
import { getQueueToken } from '@nestjs/bull';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('VendorsService', () => {
  let service: VendorsService;

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
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      updateMany: jest.fn(),
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
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CORE_MODULE, useValue: mockClientProxy },
        { provide: ReceiveService, useValue: mockReceiveService },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==================== listWithProjectData ====================
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
          where: { name: { contains: 'test', mode: 'insensitive' } },
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
    });
  });

  // ==================== findOne ====================
  describe('findOne', () => {
    it('should return a vendor by uuid', async () => {
      const uuid = 'vendor-uuid-123';
      const mockVendor = { id: 1, uuid, name: 'Test Vendor' };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);

      const result = await service.findOne(uuid);

      expect(result).toEqual(mockVendor);
      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid },
      });
    });

    it('should return null if vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      const result = await service.findOne('non-existent-uuid');

      expect(result).toBeNull();
    });
  });

  // ==================== getVendorWalletStats ====================
  describe('getVendorWalletStats', () => {
    it('should return vendor wallet stats successfully', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const mockVendor = {
        uuid: 'vendor-123',
        walletAddress: 'vendor-wallet-address',
      };
      const mockBalance = [
        { asset_code: 'XLM', balance: '1000' },
        { asset_code: 'RAHAT', balance: '500' },
      ];
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockReceiveService.getAccountBalance.mockResolvedValue(mockBalance);
      jest.spyOn(service, 'getVendorAssignedTokens').mockResolvedValue(1000);
      jest.spyOn(service, 'getVendorAssignedBalance').mockResolvedValue(500);
      (service as any).getRecentTransactionDb = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getVendorWalletStats(vendorWallet);

      expect(result).toEqual(
        expect.objectContaining({
          assignedTokens: 1000,
          disbursedTokens: 1000,
          vendorAssignedBalance: 500,
          balances: mockBalance,
          transactions: [],
        })
      );
    });

    it('should throw error if vendor not found', async () => {
      const vendorWallet = { uuid: 'non-existent', take: 10, skip: 0 };
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(
        service.getVendorWalletStats(vendorWallet)
      ).rejects.toThrow('Vendor with id non-existent not found');
    });

    it('should throw error if balance fetch fails', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      mockPrismaService.vendor.findUnique.mockResolvedValue({
        uuid: 'vendor-123',
        walletAddress: 'vendor-wallet-address',
      });
      mockReceiveService.getAccountBalance.mockResolvedValue(null);

      await expect(
        service.getVendorWalletStats(vendorWallet)
      ).rejects.toThrow(
        'Failed to get balance for vendor with id vendor-123'
      );
    });

    it('should handle errors in getVendorWalletStats', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      mockPrismaService.vendor.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.getVendorWalletStats(vendorWallet)
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== getVendorAssignedTokens ====================
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
        where: { type: 'VENDOR', payoutProcessorId: vendorUuid },
        include: { beneficiaryGroupToken: true },
      });
    });

    it('should return disbursed tokens for vendor', async () => {
      const vendorUuid = 'vendor-123';
      const mockPayouts = [
        { beneficiaryGroupToken: { numberOfTokens: 200 } },
      ];
      mockPrismaService.payouts.findMany.mockResolvedValue(mockPayouts);

      const result = await service.getVendorAssignedTokens(vendorUuid, true);

      expect(result).toBe(200);
      expect(mockPrismaService.payouts.findMany).toHaveBeenCalledWith({
        where: {
          type: 'VENDOR',
          payoutProcessorId: vendorUuid,
          beneficiaryGroupToken: { isDisbursed: true },
        },
        include: { beneficiaryGroupToken: true },
      });
    });

    it('should handle errors in getVendorAssignedTokens', async () => {
      mockPrismaService.payouts.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.getVendorAssignedTokens('vendor-123')
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== getVendorAssignedBalance ====================
  describe('getVendorAssignedBalance', () => {
    it('should return aggregate sum of completed redemptions', async () => {
      const vendorUuid = 'vendor-123';
      mockPrismaService.beneficiaryRedeem.aggregate.mockResolvedValue({
        _sum: { amount: 500 },
      });

      const result = await service.getVendorAssignedBalance(vendorUuid);

      expect(result).toBe(500);
      expect(
        mockPrismaService.beneficiaryRedeem.aggregate
      ).toHaveBeenCalledWith({
        where: { vendorUid: vendorUuid, status: 'COMPLETED' },
        _sum: { amount: true },
      });
    });

    it('should return 0 when sum is null (no completed redemptions)', async () => {
      mockPrismaService.beneficiaryRedeem.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const result = await service.getVendorAssignedBalance('vendor-123');

      expect(result).toBe(0);
    });

    it('should throw RpcException on database error', async () => {
      mockPrismaService.beneficiaryRedeem.aggregate.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        service.getVendorAssignedBalance('vendor-123')
      ).rejects.toThrow('DB error');
    });
  });

  // ==================== getRedemptionRequest ====================
  describe('getRedemptionRequest', () => {
    it('should return redemption requests for vendor', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      const mockRedemptions = [
        { uuid: 'redeem-1', vendorUid: 'vendor-123', amount: 100 },
        { uuid: 'redeem-2', vendorUid: 'vendor-123', amount: 200 },
      ];
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedemptions
      );

      const result = await service.getRedemptionRequest(vendorWallet);

      expect(result).toEqual(mockRedemptions);
      expect(
        mockPrismaService.beneficiaryRedeem.findMany
      ).toHaveBeenCalledWith({
        where: { vendorUid: 'vendor-123' },
        take: 10,
        skip: 0,
      });
    });

    it('should use default take and skip values', async () => {
      const vendorWallet = { uuid: 'vendor-123' };
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([
        { uuid: 'redeem-1' },
      ]);

      await service.getRedemptionRequest(vendorWallet);

      expect(
        mockPrismaService.beneficiaryRedeem.findMany
      ).toHaveBeenCalledWith({
        where: { vendorUid: 'vendor-123' },
        take: 10,
        skip: 0,
      });
    });

    it('should throw error when no redemption requests found', async () => {
      const vendorWallet = { uuid: 'vendor-123', take: 10, skip: 0 };
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      await expect(
        service.getRedemptionRequest(vendorWallet)
      ).rejects.toThrow('No redemption requests found for vendor');
    });

    it('should handle errors in getRedemptionRequest', async () => {
      mockPrismaService.beneficiaryRedeem.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.getRedemptionRequest({ uuid: 'vendor-123', take: 10, skip: 0 })
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== getTxnAndRedemptionList ====================
  describe('getTxnAndRedemptionList', () => {
    it('should return paginated transactions and redemptions', async () => {
      const payload = { page: 1, perPage: 20, uuid: 'vendor-123' };
      const mockTransactions = [
        { uuid: 'txn-1', vendorUid: 'vendor-123', amount: 100 },
      ];
      Object.assign(mockPrismaService.beneficiaryRedeem, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(mockTransactions),
      });

      const result = await service.getTxnAndRedemptionList(payload);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        ...mockTransactions[0],
        Beneficiary: { phone: null, name: null },
      });
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

      expect(
        mockPrismaService.beneficiaryRedeem.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vendorUid: 'vendor-123',
            status: 'COMPLETED',
            txHash: 'tx-hash-123',
          },
        })
      );
    });

    it('should handle errors in getTxnAndRedemptionList', async () => {
      const payload = { page: 1, perPage: 20, uuid: 'vendor-123' };
      mockPrismaService.beneficiaryRedeem.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.getTxnAndRedemptionList(payload)
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== getVendorBeneficiaries ====================
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
      ];
      const mockBeneficiaryResponse = [{ uuid: 'ben-1', name: 'John Doe' }];
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockBeneficiaryRedeems
      );
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ name: 'John Doe' });
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
      const mockBeneficiaryRedeems = [
        {
          beneficiaryWalletAddress: 'wallet-1',
          vendorUid: 'test-vendor-uuid',
          transactionType: 'VENDOR_REIMBURSEMENT',
          amount: 100,
          txHash: 'tx-hash-1',
          status: 'PENDING',
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
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockBeneficiaryRedeems
      );
      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(1);
    });

    it('should throw error when vendor not found', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'non-existent-vendor',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(
        service.getVendorBeneficiaries(payload)
      ).rejects.toThrow('Vendor with id non-existent-vendor not found');
    });

    it('should return empty result when no beneficiaryRedeems found', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue({
        uuid: 'test-vendor-uuid',
      });
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.getVendorBeneficiaries(payload);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should handle errors in getVendorBeneficiaries', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'test-vendor-uuid',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      mockPrismaService.vendor.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.getVendorBeneficiaries(payload)
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== processVendorOnlinePayout ====================
  describe('processVendorOnlinePayout', () => {
    it('should add online payout job to vendorCVAPayoutQueue', async () => {
      const payload = {
        beneficiaryGroupUuid: 'group-uuid',
        amount: '1000',
      };
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.processVendorOnlinePayout(payload);

      expect(mockVendorCVAPayoutQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        {
          beneficiaryGroupUuid: 'group-uuid',
          amount: '1000',
        }
      );
      expect(result).toEqual({
        success: true,
        message: 'Vendor online payout job added to queue',
        beneficiaryGroupUuid: 'group-uuid',
      });
    });

    it('should throw RpcException on queue error', async () => {
      mockVendorCVAPayoutQueue.add.mockRejectedValue(
        new Error('Queue unavailable')
      );

      await expect(
        service.processVendorOnlinePayout({
          beneficiaryGroupUuid: 'group-uuid',
          amount: '1000',
        })
      ).rejects.toThrow('Queue unavailable');
    });
  });

  // ==================== processVendorOfflinePayout ====================
  describe('processVendorOfflinePayout', () => {
    it('should add offline payout job to vendorCVAPayoutQueue', async () => {
      const payload = {
        beneficiaryGroupUuid: 'group-uuid',
        amount: '500',
      };
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job-2' });

      const result = await service.processVendorOfflinePayout(payload);

      expect(mockVendorCVAPayoutQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        {
          beneficiaryGroupUuid: 'group-uuid',
          amount: '500',
        }
      );
      expect(result).toEqual({
        success: true,
        message: 'Vendor offline payout job added to queue',
        beneficiaryGroupUuid: 'group-uuid',
      });
    });

    it('should throw RpcException on queue error', async () => {
      mockVendorCVAPayoutQueue.add.mockRejectedValue(
        new Error('Queue error')
      );

      await expect(
        service.processVendorOfflinePayout({
          beneficiaryGroupUuid: 'group-uuid',
          amount: '500',
        })
      ).rejects.toThrow('Queue error');
    });
  });

  // ==================== testVendorOfflinePayout ====================
  describe('testVendorOfflinePayout', () => {
    it('should add test offline payout job with amount', async () => {
      const payload = {
        beneficiaryGroupUuid: 'group-uuid',
        testAmount: '1000',
      };
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job-3' });

      const result = await service.testVendorOfflinePayout(payload as any);

      expect(mockVendorCVAPayoutQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        {
          beneficiaryGroupUuid: 'group-uuid',
          amount: '1000',
        }
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          beneficiaryGroupUuid: 'group-uuid',
          testAmount: '1000',
        })
      );
    });

    it('should add test offline payout job without testAmount', async () => {
      const payload = { beneficiaryGroupUuid: 'group-uuid' };
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job-4' });

      const result = await service.testVendorOfflinePayout(payload as any);

      // No 'amount' key in jobData when testAmount is not provided
      expect(mockVendorCVAPayoutQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { beneficiaryGroupUuid: 'group-uuid' }
      );
      expect(result.success).toBe(true);
    });

    it('should throw RpcException on queue error', async () => {
      mockVendorCVAPayoutQueue.add.mockRejectedValue(
        new Error('Queue unavailable')
      );

      await expect(
        service.testVendorOfflinePayout({
          beneficiaryGroupUuid: 'group-uuid',
        } as any)
      ).rejects.toThrow('Queue unavailable');
    });
  });

  // ==================== verifyVendorOfflineOtp ====================
  describe('verifyVendorOfflineOtp', () => {
    const basePayload = {
      vendorUuid: 'vendor-123',
      phoneNumber: '+9779841000000',
      otp: '1234',
    };
    const mockVendor = { uuid: 'vendor-123' };
    const mockOtpData = {
      phoneNumber: '+9779841000000',
      otpHash: 'hashed-otp',
      amount: 100,
      expiresAt: new Date(Date.now() + 60000), // 1 minute in future
      isVerified: false,
    };
    const mockBeneficiary = {
      uuid: 'ben-uuid',
      walletAddress: 'wallet-123',
    };

    it('should return isValid:true for valid OTP', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue(mockOtpData);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.otp.update.mockResolvedValue({});

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(true);
      expect(result.message).toBe('OTP verified successfully');
      expect(result.beneficiaryUuid).toBe('ben-uuid');
      expect(result.walletAddress).toBe('wallet-123');
      expect(result.amount).toBe(100);
      expect(mockPrismaService.otp.update).toHaveBeenCalledWith({
        where: { phoneNumber: basePayload.phoneNumber },
        data: { isVerified: true },
      });
    });

    it('should throw RpcException when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyVendorOfflineOtp(basePayload)
      ).rejects.toThrow('Vendor with id vendor-123 not found');
    });

    it('should return isValid:false when no OTP found for phone', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue(null);

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('No OTP found for this phone number');
    });

    it('should return isValid:false when OTP has expired', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue({
        ...mockOtpData,
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('OTP has expired');
    });

    it('should return isValid:false when OTP already verified', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue({
        ...mockOtpData,
        isVerified: true,
      });

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('OTP has already been used');
    });

    it('should return isValid:false when OTP is incorrect', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue(mockOtpData);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('Invalid OTP');
    });

    it('should return isValid:false when beneficiary not found for phone', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.otp.findUnique.mockResolvedValue(mockOtpData);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(null);

      const result = await service.verifyVendorOfflineOtp(basePayload);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        'Beneficiary not found for this phone number'
      );
    });
  });

  // ==================== fetchVendorOfflineBeneficiaries ====================
  describe('fetchVendorOfflineBeneficiaries', () => {
    const vendorUuid = 'vendor-123';
    const mockVendor = { uuid: vendorUuid };
    const mockRedeems = [
      {
        uuid: 'redeem-uuid-1',
        status: 'PENDING',
        amount: 100,
        Beneficiary: { uuid: 'ben-uuid', walletAddress: 'wallet-1' },
      },
    ];

    it('should return offline beneficiary details with OTP hash', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeems
      );
      mockClientProxy.send.mockReturnValue(
        of([
          {
            walletAddress: 'wallet-1',
            piiData: { name: 'John Doe', phone: '+9779841000000' },
          },
        ])
      );
      mockPrismaService.otp.findUnique.mockResolvedValue({
        otpHash: 'hashed-otp',
      });
      mockPrismaService.beneficiaryRedeem.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.fetchVendorOfflineBeneficiaries({
        vendorUuid,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        uuid: 'redeem-uuid-1',
        beneficiaryUuid: 'ben-uuid',
        beneficiaryName: 'John Doe',
        phoneNumber: '+9779841000000',
        otpHash: 'hashed-otp',
        amount: 100,
        status: 'PENDING',
      });
      expect(
        mockPrismaService.beneficiaryRedeem.updateMany
      ).toHaveBeenCalledWith({
        where: { uuid: { in: ['redeem-uuid-1'] } },
        data: { status: 'TOKEN_TRANSACTION_INITIATED' },
      });
    });

    it('should return empty array when no redeems found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      const result = await service.fetchVendorOfflineBeneficiaries({
        vendorUuid,
      });

      expect(result).toEqual([]);
      expect(mockClientProxy.send).not.toHaveBeenCalled();
    });

    it('should throw RpcException when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(
        service.fetchVendorOfflineBeneficiaries({ vendorUuid })
      ).rejects.toThrow(`Vendor with id ${vendorUuid} not found`);
    });

    it('should not call updateMany when no PENDING redeems', async () => {
      const completedRedeems = [
        {
          uuid: 'redeem-uuid-2',
          status: 'COMPLETED',
          amount: 200,
          Beneficiary: { uuid: 'ben-2', walletAddress: 'wallet-2' },
        },
      ];
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        completedRedeems
      );
      mockClientProxy.send.mockReturnValue(of([]));
      mockPrismaService.otp.findUnique.mockResolvedValue(null);

      await service.fetchVendorOfflineBeneficiaries({ vendorUuid });

      expect(
        mockPrismaService.beneficiaryRedeem.updateMany
      ).not.toHaveBeenCalled();
    });

    it('should use "Unknown" for beneficiary name when not in API response', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeems
      );
      mockClientProxy.send.mockReturnValue(of([])); // empty API response
      mockPrismaService.otp.findUnique.mockResolvedValue(null);
      mockPrismaService.beneficiaryRedeem.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.fetchVendorOfflineBeneficiaries({
        vendorUuid,
      });

      expect(result[0].beneficiaryName).toBe('Unknown');
      expect(result[0].otpHash).toBe('');
    });
  });

  // ==================== syncVendorOfflineData ====================
  describe('syncVendorOfflineData', () => {
    const vendorUuid = 'vendor-123';
    const mockVendor = { uuid: vendorUuid };

    it('should process verified beneficiaries and return results', async () => {
      const payload = {
        vendorUuid,
        verifiedBeneficiaries: [{ beneficiaryUuid: 'ben-uuid', otp: '1234' }],
      };
      const mockBeneficiary = { uuid: 'ben-uuid', walletAddress: 'wallet-1' };
      const mockRedeemRecord = { uuid: 'redeem-1', amount: 100 };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(
        mockRedeemRecord
      );
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job-sync-1' });

      const result = await service.syncVendorOfflineData(payload as any);

      expect(result.vendorUuid).toBe(vendorUuid);
      expect(result.totalProcessed).toBe(1);
      expect(result.results[0]).toMatchObject({
        beneficiaryUuid: 'ben-uuid',
        success: true,
        message: 'Queued for token transfer',
      });
      expect(mockVendorCVAPayoutQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          vendorUuid,
          beneficiaryUuid: 'ben-uuid',
          amount: 100,
          otp: '1234',
        }),
        expect.any(Object)
      );
    });

    it('should throw RpcException when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(
        service.syncVendorOfflineData({
          vendorUuid,
          verifiedBeneficiaries: [],
        } as any)
      ).rejects.toThrow(`Vendor with id ${vendorUuid} not found`);
    });

    it('should push failure result when beneficiaryUuid is missing', async () => {
      const payload = {
        vendorUuid,
        verifiedBeneficiaries: [{ beneficiaryUuid: null, otp: '1234' }],
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);

      const result = await service.syncVendorOfflineData(payload as any);

      expect(result.results[0]).toMatchObject({
        success: false,
        message: 'Beneficiary UUID missing',
      });
    });

    it('should push failure result when beneficiary not found', async () => {
      const payload = {
        vendorUuid,
        verifiedBeneficiaries: [{ beneficiaryUuid: 'non-existent', otp: '1234' }],
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiary.findUnique.mockResolvedValue(null);

      const result = await service.syncVendorOfflineData(payload as any);

      expect(result.results[0]).toMatchObject({
        beneficiaryUuid: 'non-existent',
        success: false,
        message: 'Beneficiary not found',
      });
    });

    it('should push failure result when redeem record not found', async () => {
      const payload = {
        vendorUuid,
        verifiedBeneficiaries: [{ beneficiaryUuid: 'ben-uuid', otp: '1234' }],
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiary.findUnique.mockResolvedValue({
        uuid: 'ben-uuid',
        walletAddress: 'wallet-1',
      });
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);

      const result = await service.syncVendorOfflineData(payload as any);

      expect(result.results[0]).toMatchObject({
        success: false,
        message: 'Redemption record not found',
      });
    });

    it('should process multiple beneficiaries and return all results', async () => {
      const payload = {
        vendorUuid,
        verifiedBeneficiaries: [
          { beneficiaryUuid: 'ben-1', otp: '1111' },
          { beneficiaryUuid: 'ben-2', otp: '2222' },
        ],
      };
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiary.findUnique
        .mockResolvedValueOnce({ uuid: 'ben-1', walletAddress: 'wallet-1' })
        .mockResolvedValueOnce({ uuid: 'ben-2', walletAddress: 'wallet-2' });
      mockPrismaService.beneficiaryRedeem.findFirst
        .mockResolvedValueOnce({ uuid: 'redeem-1', amount: 100 })
        .mockResolvedValueOnce({ uuid: 'redeem-2', amount: 200 });
      mockVendorCVAPayoutQueue.add.mockResolvedValue({ id: 'job' });

      const result = await service.syncVendorOfflineData(payload as any);

      expect(result.totalProcessed).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.success)).toBe(true);
    });
  });

  // ==================== processBatchTransfer ====================
  describe('processBatchTransfer', () => {
    const batchData = {
      transfers: [
        {
          beneficiaryWalletAddress: 'wallet-1',
          vendorWalletAddress: 'vendor-wallet',
          amount: '100',
        },
      ],
      batchId: 'batch-001',
    };

    it('should queue batch transfer and return success result', async () => {
      mockBatchTransferQueue.add.mockResolvedValue({ id: 'batch-job-1' });

      const result = await service.processBatchTransfer(batchData);

      expect(mockBatchTransferQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        batchData,
        expect.objectContaining({ attempts: 3 })
      );
      expect(result).toEqual({
        success: true,
        jobId: 'batch-job-1',
        message: 'Batch transfer added successfully',
      });
    });

    it('should return failure result (not throw) when queue fails', async () => {
      mockBatchTransferQueue.add.mockRejectedValue(
        new Error('Queue unavailable')
      );

      const result = await service.processBatchTransfer(batchData);

      // processBatchTransfer catches errors and returns failure instead of throwing
      expect(result).toEqual({
        success: false,
        error: 'Queue unavailable',
        message: 'Failed to process batch transfer',
      });
    });

    it('should handle batch without batchId', async () => {
      const dataWithoutBatchId = { transfers: batchData.transfers };
      mockBatchTransferQueue.add.mockResolvedValue({ id: 'job-2' });

      const result = await service.processBatchTransfer(dataWithoutBatchId);

      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-2');
    });
  });
});
