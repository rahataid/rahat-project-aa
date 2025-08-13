import { Test, TestingModule } from '@nestjs/testing';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto, VendorRedeemDto } from './dto/vendorStats.dto';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { PayoutMode } from '@prisma/client';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';

describe('VendorsController', () => {
  let controller: VendorsController;
  let vendorsService: VendorsService;

  const mockVendorsService = {
    listWithProjectData: jest.fn(),
    getVendorWalletStats: jest.fn(),
    getTxnAndRedemptionList: jest.fn(),
    getVendorBeneficiaries: jest.fn(),
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
    vendorsService = module.get<VendorsService>(VendorsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

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
        meta: {
          total: 2,
          page: 1,
          perPage: 20,
        },
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

      const error = new Error('Service error');
      mockVendorsService.listWithProjectData.mockRejectedValue(error);

      await expect(controller.listWithData(query)).rejects.toThrow('Service error');
    });
  });

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
        transactions: [
          {
            title: 'VOUCHER',
            subtitle: 'ben-wallet-1',
            date: new Date(),
            amount: '100',
            hash: 'tx-hash-123',
            beneficiaryName: 'John Doe',
          },
        ],
      };

      mockVendorsService.getVendorWalletStats.mockResolvedValue(expectedStats);

      const result = await controller.getVendorStats(vendorWallet);

      expect(result).toEqual(expectedStats);
      expect(mockVendorsService.getVendorWalletStats).toHaveBeenCalledWith(vendorWallet);
    });

    it('should handle missing optional parameters', async () => {
      const vendorWallet: VendorStatsDto = {
        uuid: 'vendor-123',
      };

      const expectedStats = {
        assignedTokens: 0,
        disbursedTokens: 0,
        balances: [],
        transactions: [],
      };

      mockVendorsService.getVendorWalletStats.mockResolvedValue(expectedStats);

      const result = await controller.getVendorStats(vendorWallet);

      expect(result).toEqual(expectedStats);
      expect(mockVendorsService.getVendorWalletStats).toHaveBeenCalledWith(vendorWallet);
    });

    it('should propagate service errors for vendor stats', async () => {
      const vendorWallet: VendorStatsDto = {
        uuid: 'non-existent-vendor',
      };

      const error = new Error('Vendor not found');
      mockVendorsService.getVendorWalletStats.mockRejectedValue(error);

      await expect(controller.getVendorStats(vendorWallet)).rejects.toThrow('Vendor not found');
    });
  });

  describe('getTxnAndRedemptionRequestList', () => {
    it('should return transaction and redemption list', async () => {
      const vendorWallet: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'txn-1',
            vendorUid: 'vendor-123',
            amount: 100,
            createdAt: new Date(),
            txHash: 'tx-hash-123',
            status: 'TOKEN_TRANSACTION_COMPLET',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 20,
        },
      };

      mockVendorsService.getTxnAndRedemptionList.mockResolvedValue(expectedResult);

      const result = await controller.getTxnAndRedemptionRequestList(vendorWallet);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getTxnAndRedemptionList).toHaveBeenCalledWith(vendorWallet);
    });

    it('should handle filters in transaction list', async () => {
      const vendorWallet: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
        txHash: 'specific-tx-hash',
        status: 'success',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'txn-1',
            vendorUid: 'vendor-123',
            txHash: 'specific-tx-hash',
            status: 'TOKEN_TRANSACTION_COMPLET',
          },
        ],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      mockVendorsService.getTxnAndRedemptionList.mockResolvedValue(expectedResult);

      const result = await controller.getTxnAndRedemptionRequestList(vendorWallet);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getTxnAndRedemptionList).toHaveBeenCalledWith(vendorWallet);
    });

    it('should propagate service errors for transaction list', async () => {
      const vendorWallet: VendorRedeemTxnListDto = {
        page: 1,
        perPage: 20,
        uuid: 'vendor-123',
      };

      const error = new Error('Database error');
      mockVendorsService.getTxnAndRedemptionList.mockRejectedValue(error);

      await expect(controller.getTxnAndRedemptionRequestList(vendorWallet)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('getVendorBeneficiaries', () => {
    it('should return vendor beneficiaries for ONLINE mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'vendor-123',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      const expectedResult = {
        data: [
          {
            uuid: 'ben-1',
            walletAddress: 'wallet-1',
            phone: '1234567890',
            gender: 'MALE',
            benTokens: 100,
            isVerified: true,
            name: 'John Doe',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 20,
        },
      };

      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(expectedResult);

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getVendorBeneficiaries).toHaveBeenCalledWith(payload);
    });

    it('should return vendor beneficiaries for OFFLINE mode', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'vendor-123',
        payoutMode: PayoutMode.OFFLINE,
        page: 1,
        perPage: 20,
      };

      const expectedResult = {
        data: [
          {
            uuid: 'ben-1',
            walletAddress: 'wallet-1',
            phone: '1234567890',
            gender: 'FEMALE',
            benTokens: 200,
            isVerified: false,
            name: 'Jane Smith',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 20,
        },
      };

      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(expectedResult);

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getVendorBeneficiaries).toHaveBeenCalledWith(payload);
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
        meta: {
          total: 0,
          page: 1,
          perPage: 20,
        },
      };

      mockVendorsService.getVendorBeneficiaries.mockResolvedValue(expectedResult);

      const result = await controller.getVendorBeneficiaries(payload);

      expect(result).toEqual(expectedResult);
      expect(mockVendorsService.getVendorBeneficiaries).toHaveBeenCalledWith(payload);
    });

    it('should propagate service errors for beneficiaries', async () => {
      const payload: VendorBeneficiariesDto = {
        vendorUuid: 'non-existent-vendor',
        payoutMode: PayoutMode.ONLINE,
        page: 1,
        perPage: 20,
      };

      const error = new Error('Vendor not found');
      mockVendorsService.getVendorBeneficiaries.mockRejectedValue(error);

      await expect(controller.getVendorBeneficiaries(payload)).rejects.toThrow('Vendor not found');
    });
  });
});
