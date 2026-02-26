import { Test, TestingModule } from '@nestjs/testing';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto } from './dto/vendorStats.dto';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { TokenRedemptionStatus } from './dto/vendorTokenRedemption.dto';

describe('VendorsController', () => {
  let controller: VendorsController;

  const mockVendorsService = {
    listWithProjectData: jest.fn(),
    getVendorWalletStats: jest.fn(),
    getTxnAndRedemptionList: jest.fn(),
    getVendorBeneficiaries: jest.fn(),
    fetchVendorOfflineBeneficiaries: jest.fn(),
    verifyVendorOfflineOtp: jest.fn(),
    testVendorOfflinePayout: jest.fn(),
    syncVendorOfflineData: jest.fn(),
    processBatchTransfer: jest.fn(),
  };

  const mockVendorTokenRedemptionService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
    getVendorRedemptions: jest.fn(),
    getVendorTokenRedemptionStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        {
          provide: VendorsService,
          useValue: mockVendorsService,
        },
        {
          provide: VendorTokenRedemptionService,
          useValue: mockVendorTokenRedemptionService,
        },
      ],
    }).compile();

    controller = module.get<VendorsController>(VendorsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== listWithData ====================
  describe('listWithData', () => {
    it('should return vendors list with project data', async () => {
      const query: PaginationBaseDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
        search: 'test',
      };
      const expectedResult = {
        data: [
          { id: 1, uuid: 'vendor-1', name: 'Test Vendor 1' },
          { id: 2, uuid: 'vendor-2', name: 'Test Vendor 2' },
        ],
        meta: { total: 2, page: 1, perPage: 20 },
      };
      mockVendorsService.listWithProjectData.mockResolvedValue(expectedResult);

      const result = await controller.listWithData(query);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.listWithProjectData).toHaveBeenCalledWith(query);
    });

    it('should handle query without search parameter', async () => {
      const query: PaginationBaseDto = {
        page: 1,
        perPage: 10,
        sort: 'createdAt',
        order: 'desc',
      };
      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, perPage: 10 },
      };
      mockVendorsService.listWithProjectData.mockResolvedValue(expectedResult);

      const result = await controller.listWithData(query);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.listWithProjectData).toHaveBeenCalledWith(query);
    });

    it('should propagate service errors', async () => {
      const query: PaginationBaseDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
      };
      mockVendorsService.listWithProjectData.mockRejectedValue(
        new Error('Service error')
      );

      await expect(controller.listWithData(query)).rejects.toThrow(
        'Service error'
      );
    });
  });

  // ==================== getVendorStats ====================
  describe('getVendorStats', () => {
    it('should return vendor wallet statistics', async () => {
      const vendorWallet: VendorStatsDto = {
        uuid: 'vendor-123',
        take: 10,
        skip: 0,
      };
      const expectedStats = {
        assignedTokens: 1000,
        disbursedTokens: 500,
        balances: [
          { asset_code: 'XLM', balance: '1000' },
          { asset_code: 'RAHAT', balance: '500' },
        ],
        transactions: [],
      };
      mockVendorsService.getVendorWalletStats.mockResolvedValue(expectedStats);

      const result = await controller.getVendorStats(vendorWallet);

      expect(result).toEqual(expectedStats);
      expect(mockVendorsService.getVendorWalletStats).toHaveBeenCalledWith(
        vendorWallet
      );
    });

    it('should handle missing optional parameters', async () => {
      const vendorWallet: VendorStatsDto = { uuid: 'vendor-123' };
      const expectedStats = {
        assignedTokens: 0,
        disbursedTokens: 0,
        balances: [],
        transactions: [],
      };
      mockVendorsService.getVendorWalletStats.mockResolvedValue(expectedStats);

      const result = await controller.getVendorStats(vendorWallet);

      expect(result).toEqual(expectedStats);
    });

    it('should propagate service errors for vendor stats', async () => {
      const vendorWallet: VendorStatsDto = { uuid: 'non-existent-vendor' };
      mockVendorsService.getVendorWalletStats.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(controller.getVendorStats(vendorWallet)).rejects.toThrow(
        'Vendor not found'
      );
    });
  });

  // ==================== getTxnAndRedemptionRequestList ====================
  describe('getTxnAndRedemptionRequestList', () => {
    it('should return transaction and redemption list', async () => {
      const payload: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };
      const expectedResult = {
        data: [{ uuid: 'txn-1', vendorUid: 'vendor-123', amount: 100 }],
        meta: { total: 1, page: 1, perPage: 20 },
      };
      mockVendorsService.getTxnAndRedemptionList.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getTxnAndRedemptionRequestList(payload);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getTxnAndRedemptionList).toHaveBeenCalledWith(
        payload
      );
    });

    it('should handle filters in transaction list', async () => {
      const payload: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
        txHash: 'specific-tx-hash',
        status: 'success',
      };
      const expectedResult = { data: [], meta: { total: 0 } };
      mockVendorsService.getTxnAndRedemptionList.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getTxnAndRedemptionRequestList(payload);

      expect(mockVendorsService.getTxnAndRedemptionList).toHaveBeenCalledWith(
        payload
      );
      expect(result).toEqual(expectedResult);
    });

    it('should propagate service errors for transaction list', async () => {
      const payload: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };
      mockVendorsService.getTxnAndRedemptionList.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        controller.getTxnAndRedemptionRequestList(payload)
      ).rejects.toThrow('Database error');
    });
  });

  // ==================== getVendorBeneficiaries ====================
  describe('getVendorBeneficiaries', () => {
    it('should return vendor beneficiaries for ONLINE mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'vendor-123',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      const expectedResult = {
        data: [{ uuid: 'ben-1', name: 'John Doe' }],
        meta: { total: 1, page: 1, perPage: 20 },
      };
      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getVendorBeneficiaries).toHaveBeenCalledWith(
        payload
      );
    });

    it('should return vendor beneficiaries for OFFLINE mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'vendor-123',
        payoutMode: PayoutMode.OFFLINE,
        page: 1,
        perPage: 20,
      };
      const expectedResult = {
        data: [{ uuid: 'ben-1', name: 'Jane Smith' }],
        meta: { total: 1, page: 1, perPage: 20 },
      };
      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result).toEqual(expectedResult);
    });

    it('should return empty result when no beneficiaries found', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'vendor-123',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, perPage: 20 },
      };
      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result.data).toHaveLength(0);
    });

    it('should propagate service errors for beneficiaries', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'non-existent-vendor',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };
      mockVendorsService.getVendorBeneficiaries.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(controller.getVendorBeneficiaries(payload)).rejects.toThrow(
        'Vendor not found'
      );
    });
  });

  // ==================== getVendorOfflineBeneficiaries ====================
  describe('getVendorOfflineBeneficiaries', () => {
    it('should return offline beneficiaries list', async () => {
      const payload = { vendorUuid: 'vendor-123' };
      const expectedResult = [
        {
          uuid: 'redeem-1',
          beneficiaryUuid: 'ben-1',
          beneficiaryName: 'John Doe',
          phoneNumber: '+9779841000000',
          otpHash: 'hash-123',
          amount: 100,
          status: 'PENDING',
        },
      ];
      mockVendorsService.fetchVendorOfflineBeneficiaries.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorOfflineBeneficiaries(
        payload as any
      );

      expect(result).toEqual(expectedResult);
      expect(
        mockVendorsService.fetchVendorOfflineBeneficiaries
      ).toHaveBeenCalledWith(payload);
    });

    it('should return empty array when no offline beneficiaries', async () => {
      const payload = { vendorUuid: 'vendor-123' };
      mockVendorsService.fetchVendorOfflineBeneficiaries.mockResolvedValue([]);

      const result = await controller.getVendorOfflineBeneficiaries(
        payload as any
      );

      expect(result).toEqual([]);
    });

    it('should propagate service errors', async () => {
      const payload = { vendorUuid: 'vendor-123' };
      mockVendorsService.fetchVendorOfflineBeneficiaries.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(
        controller.getVendorOfflineBeneficiaries(payload as any)
      ).rejects.toThrow('Vendor not found');
    });
  });

  // ==================== verifyVendorOfflineOtp ====================
  describe('verifyVendorOfflineOtp', () => {
    it('should return valid OTP verification result', async () => {
      const payload = {
        vendorUuid: 'vendor-123',
        phoneNumber: '+9779841000000',
        otp: '1234',
      };
      const expectedResult = {
        isValid: true,
        message: 'OTP verified successfully',
        beneficiaryUuid: 'ben-uuid',
        amount: 100,
        walletAddress: 'wallet-123',
      };
      mockVendorsService.verifyVendorOfflineOtp.mockResolvedValue(
        expectedResult
      );

      const result = await controller.verifyVendorOfflineOtp(payload as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.verifyVendorOfflineOtp).toHaveBeenCalledWith(
        payload
      );
    });

    it('should return invalid OTP result when OTP is wrong', async () => {
      const payload = {
        vendorUuid: 'vendor-123',
        phoneNumber: '+9779841000000',
        otp: 'wrong',
      };
      const expectedResult = { isValid: false, message: 'Invalid OTP' };
      mockVendorsService.verifyVendorOfflineOtp.mockResolvedValue(
        expectedResult
      );

      const result = await controller.verifyVendorOfflineOtp(payload as any);

      expect(result.isValid).toBe(false);
    });

    it('should propagate service errors', async () => {
      mockVendorsService.verifyVendorOfflineOtp.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(
        controller.verifyVendorOfflineOtp({ vendorUuid: 'x', phoneNumber: '', otp: '' } as any)
      ).rejects.toThrow('Vendor not found');
    });
  });

  // ==================== testVendorOfflinePayout ====================
  describe('testVendorOfflinePayout', () => {
    it('should queue a test offline payout job', async () => {
      const payload = {
        beneficiaryGroupUuid: 'group-uuid',
        testAmount: '1000',
      };
      const expectedResult = {
        success: true,
        message: 'Vendor offline payout test job added to queue',
        beneficiaryGroupUuid: 'group-uuid',
        testAmount: '1000',
      };
      mockVendorsService.testVendorOfflinePayout.mockResolvedValue(
        expectedResult
      );

      const result = await controller.testVendorOfflinePayout(payload as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.testVendorOfflinePayout).toHaveBeenCalledWith(
        payload
      );
    });

    it('should handle payload without testAmount', async () => {
      const payload = { beneficiaryGroupUuid: 'group-uuid' };
      const expectedResult = { success: true, message: 'Job queued' };
      mockVendorsService.testVendorOfflinePayout.mockResolvedValue(
        expectedResult
      );

      const result = await controller.testVendorOfflinePayout(payload as any);

      expect(result).toEqual(expectedResult);
    });

    it('should propagate service errors', async () => {
      mockVendorsService.testVendorOfflinePayout.mockRejectedValue(
        new Error('Queue error')
      );

      await expect(
        controller.testVendorOfflinePayout({ beneficiaryGroupUuid: 'x' } as any)
      ).rejects.toThrow('Queue error');
    });
  });

  // ==================== syncVendorOfflineData ====================
  describe('syncVendorOfflineData', () => {
    it('should sync offline vendor data and return results', async () => {
      const payload = {
        vendorUuid: 'vendor-123',
        verifiedBeneficiaries: [
          { beneficiaryUuid: 'ben-1', otp: '1234' },
          { beneficiaryUuid: 'ben-2', otp: '5678' },
        ],
      };
      const expectedResult = {
        vendorUuid: 'vendor-123',
        totalProcessed: 2,
        results: [
          {
            beneficiaryUuid: 'ben-1',
            success: true,
            message: 'Queued for token transfer',
          },
          {
            beneficiaryUuid: 'ben-2',
            success: true,
            message: 'Queued for token transfer',
          },
        ],
      };
      mockVendorsService.syncVendorOfflineData.mockResolvedValue(
        expectedResult
      );

      const result = await controller.syncVendorOfflineData(payload as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.syncVendorOfflineData).toHaveBeenCalledWith(
        payload
      );
    });

    it('should propagate service errors for vendor not found', async () => {
      const payload = {
        vendorUuid: 'non-existent',
        verifiedBeneficiaries: [],
      };
      mockVendorsService.syncVendorOfflineData.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(
        controller.syncVendorOfflineData(payload as any)
      ).rejects.toThrow('Vendor not found');
    });
  });

  // ==================== createTokenRedemption ====================
  describe('createTokenRedemption', () => {
    it('should create a token redemption', async () => {
      const dto = { vendorUuid: 'vendor-123', tokenAmount: 1000 };
      const expectedResult = {
        id: 1,
        uuid: 'redemption-uuid',
        vendorUuid: 'vendor-123',
        tokenAmount: 1000,
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
      };
      mockVendorTokenRedemptionService.create.mockResolvedValue(expectedResult);

      const result = await controller.createTokenRedemption(dto as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorTokenRedemptionService.create).toHaveBeenCalledWith(dto);
    });

    it('should propagate service errors', async () => {
      mockVendorTokenRedemptionService.create.mockRejectedValue(
        new Error('Vendor not found')
      );

      await expect(
        controller.createTokenRedemption({ vendorUuid: 'x', tokenAmount: 100 } as any)
      ).rejects.toThrow('Vendor not found');
    });
  });

  // ==================== getTokenRedemption ====================
  describe('getTokenRedemption', () => {
    it('should return a token redemption by uuid', async () => {
      const dto = { uuid: 'redemption-uuid' };
      const expectedResult = {
        uuid: 'redemption-uuid',
        vendorUuid: 'vendor-123',
        tokenAmount: 1000,
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
      };
      mockVendorTokenRedemptionService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.getTokenRedemption(dto as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorTokenRedemptionService.findOne).toHaveBeenCalledWith(
        dto
      );
    });

    it('should return null when redemption not found', async () => {
      mockVendorTokenRedemptionService.findOne.mockResolvedValue(null);

      const result = await controller.getTokenRedemption({
        uuid: 'nonexistent',
      } as any);

      expect(result).toBeNull();
    });
  });

  // ==================== updateTokenRedemptionStatus ====================
  describe('updateTokenRedemptionStatus', () => {
    it('should update token redemption status', async () => {
      const dto = {
        uuid: 'redemption-uuid',
        redemptionStatus: TokenRedemptionStatus.APPROVED,
        approvedBy: 'admin',
      };
      const expectedResult = {
        uuid: 'redemption-uuid',
        redemptionStatus: TokenRedemptionStatus.APPROVED,
      };
      mockVendorTokenRedemptionService.update.mockResolvedValue(expectedResult);

      const result = await controller.updateTokenRedemptionStatus(dto as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorTokenRedemptionService.update).toHaveBeenCalledWith(dto);
    });

    it('should propagate service errors', async () => {
      mockVendorTokenRedemptionService.update.mockRejectedValue(
        new Error('Redemption not found')
      );

      await expect(
        controller.updateTokenRedemptionStatus({ uuid: 'x', redemptionStatus: TokenRedemptionStatus.APPROVED } as any)
      ).rejects.toThrow('Redemption not found');
    });
  });

  // ==================== listTokenRedemptions ====================
  describe('listTokenRedemptions', () => {
    it('should return paginated token redemptions list', async () => {
      const query = {
        vendorUuid: 'vendor-123',
        page: 1,
        perPage: 20,
      };
      const expectedResult = {
        data: [
          { uuid: 'redemption-1', tokenAmount: 1000 },
          { uuid: 'redemption-2', tokenAmount: 2000 },
        ],
        meta: { total: 2, page: 1, perPage: 20 },
      };
      mockVendorTokenRedemptionService.list.mockResolvedValue(expectedResult);

      const result = await controller.listTokenRedemptions(query as any);

      expect(result).toEqual(expectedResult);
      expect(mockVendorTokenRedemptionService.list).toHaveBeenCalledWith(query);
    });

    it('should handle filters in listing', async () => {
      const query = {
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
        page: 1,
        perPage: 10,
      };
      const expectedResult = { data: [], meta: { total: 0 } };
      mockVendorTokenRedemptionService.list.mockResolvedValue(expectedResult);

      const result = await controller.listTokenRedemptions(query as any);

      expect(mockVendorTokenRedemptionService.list).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(0);
    });
  });

  // ==================== getVendorRedemptions ====================
  describe('getVendorRedemptions', () => {
    it('should return all redemptions for a vendor', async () => {
      const dto = { vendorUuid: 'vendor-123' };
      const expectedResult = [
        { uuid: 'r-1', tokenAmount: 1000, redemptionStatus: 'COMPLETED' },
        { uuid: 'r-2', tokenAmount: 500, redemptionStatus: 'REQUESTED' },
      ];
      mockVendorTokenRedemptionService.getVendorRedemptions.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorRedemptions(dto as any);

      expect(result).toEqual(expectedResult);
      expect(
        mockVendorTokenRedemptionService.getVendorRedemptions
      ).toHaveBeenCalledWith(dto);
    });

    it('should return empty array when no redemptions found', async () => {
      mockVendorTokenRedemptionService.getVendorRedemptions.mockResolvedValue(
        []
      );

      const result = await controller.getVendorRedemptions({
        vendorUuid: 'vendor-123',
      } as any);

      expect(result).toEqual([]);
    });
  });

  // ==================== getVendorTokenRedemptionStats ====================
  describe('getVendorTokenRedemptionStats', () => {
    it('should return token redemption stats for a vendor', async () => {
      const dto = { vendorUuid: 'vendor-123' };
      const expectedResult = {
        totalTokensApproved: 5000,
        totalTokensPending: 1000,
      };
      mockVendorTokenRedemptionService.getVendorTokenRedemptionStats.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorTokenRedemptionStats(
        dto as any
      );

      expect(result).toEqual(expectedResult);
      expect(
        mockVendorTokenRedemptionService.getVendorTokenRedemptionStats
      ).toHaveBeenCalledWith(dto);
    });

    it('should return zero stats when no redemptions', async () => {
      const dto = { vendorUuid: 'vendor-123' };
      const expectedResult = { totalTokensApproved: 0, totalTokensPending: 0 };
      mockVendorTokenRedemptionService.getVendorTokenRedemptionStats.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getVendorTokenRedemptionStats(
        dto as any
      );

      expect(result.totalTokensApproved).toBe(0);
      expect(result.totalTokensPending).toBe(0);
    });
  });

  // ==================== processBatchTransfer ====================
  describe('processBatchTransfer', () => {
    it('should queue batch transfer and return job details', async () => {
      const data = {
        transfers: [
          {
            beneficiaryWalletAddress: 'wallet-1',
            vendorWalletAddress: 'vendor-wallet',
            amount: '100',
          },
        ],
        batchId: 'batch-001',
      };
      const expectedResult = {
        success: true,
        jobId: 'job-1',
        message: 'Batch transfer added successfully',
      };
      mockVendorsService.processBatchTransfer.mockResolvedValue(expectedResult);

      const result = await controller.processBatchTransfer(data);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.processBatchTransfer).toHaveBeenCalledWith(
        data
      );
    });

    it('should handle batch transfer without batchId', async () => {
      const data = {
        transfers: [
          {
            beneficiaryWalletAddress: 'wallet-1',
            vendorWalletAddress: 'vendor-wallet',
            amount: '100',
          },
        ],
      };
      const expectedResult = {
        success: true,
        jobId: 'job-2',
        message: 'Batch transfer added successfully',
      };
      mockVendorsService.processBatchTransfer.mockResolvedValue(expectedResult);

      const result = await controller.processBatchTransfer(data);

      expect(result.success).toBe(true);
    });

    it('should return error result when processing fails', async () => {
      const data = { transfers: [], batchId: 'batch-fail' };
      const expectedResult = {
        success: false,
        error: 'Queue error',
        message: 'Failed to process batch transfer',
      };
      mockVendorsService.processBatchTransfer.mockResolvedValue(expectedResult);

      const result = await controller.processBatchTransfer(data);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue error');
    });
  });
});
