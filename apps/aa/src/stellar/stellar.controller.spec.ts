import { Test, TestingModule } from '@nestjs/testing';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { DisburseDto } from './dto/disburse.dto';
import {
  SendOtpDto,
  SendAssetDto,
  FundAccountDto,
  SendAssetByWalletAddressDto,
  CheckTrustlineDto,
} from './dto/send-otp.dto';
import {
  GetWalletBalanceDto,
  GetTriggerDto,
  AddTriggerDto,
  UpdateTriggerParamsDto,
} from './dto/trigger.dto';
import { TransferToOfframpDto } from './dto/transfer-to-offramp.dto';
import { Job } from 'bull';

describe('StellarController', () => {
  let controller: StellarController;
  let service: jest.Mocked<StellarService>;

  const mockStellarService = {
    addDisbursementJobs: jest.fn(),
    sendOtp: jest.fn(),
    sendAssetToVendor: jest.fn(),
    sendAssetToVendorByWalletAddress: jest.fn(),
    transferToOfframpJobs: jest.fn(),
    faucetAndTrustlineService: jest.fn(),
    checkTrustline: jest.fn(),
    getDisbursementStats: jest.fn(),
    getWalletStats: jest.fn(),
    getTriggerWithID: jest.fn(),
    addTriggerOnChain: jest.fn(),
    updateOnchainTrigger: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
      ],
    }).compile();

    controller = module.get<StellarController>(StellarController);
    service = module.get(StellarService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('disburse', () => {
    const mockDisburseDto: DisburseDto = {
      dName: 'test_disbursement',
      groups: ['group1', 'group2'],
    };

    it('should call service.addDisbursementJobs with correct parameters', async () => {
      const expectedResult = {
        message: 'Disbursement jobs added for 2 groups',
        groups: [
          {
            uuid: {
              id: 1,
              uuid: 'group1',
              name: 'Test Group 1',
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: new Date(),
              tokensReserved: {
                id: 1,
                uuid: 'test-uuid',
                title: 'Test Token',
                numberOfTokens: 100,
                status: 'PENDING',
                isDisbursed: false,
                info: null,
                groupId: 'group1',
                payoutId: 'payout1',
                createdBy: 'test-user',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
            status: 'PENDING',
          },
        ],
      };
      service.addDisbursementJobs.mockResolvedValue(expectedResult);

      const result = await controller.disburse(mockDisburseDto);
      expect(result).toEqual(expectedResult);
      expect(service.addDisbursementJobs).toHaveBeenCalledWith(mockDisburseDto);
    });
  });

  describe('sendOtp', () => {
    const mockSendOtpDto: SendOtpDto = {
      phoneNumber: '+1234567890',
      amount: '100',
    };

    it('should call service.sendOtp with correct parameters', async () => {
      const expectedResult = {
        id: 1,
        phoneNumber: '+1234567890',
        otpHash: 'hashedOtp',
        amount: 100,
        expiresAt: new Date(),
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      service.sendOtp.mockResolvedValue(expectedResult);

      const result = await controller.sendOtp(mockSendOtpDto);
      expect(result).toEqual(expectedResult);
      expect(service.sendOtp).toHaveBeenCalledWith(mockSendOtpDto);
    });
  });

  describe('sendAssetToVendor', () => {
    const mockSendAssetDto: SendAssetDto = {
      phoneNumber: '+1234567890',
      otp: '123456',
      receiverAddress: 'stellar_address',
      amount: '100',
    };

    it('should call service.sendAssetToVendor with correct parameters', async () => {
      const expectedResult = { txHash: 'test_hash' };
      service.sendAssetToVendor.mockResolvedValue(expectedResult);

      const result = await controller.sendAssetToVendor(mockSendAssetDto);
      expect(result).toEqual(expectedResult);
      expect(service.sendAssetToVendor).toHaveBeenCalledWith(mockSendAssetDto);
    });
  });

  describe('sendAssetToVendorByWalletAddress', () => {
    const mockSendAssetByWalletAddressDto: SendAssetByWalletAddressDto = {
      receiverAddress: 'stellar_address',
      amount: '100',
      walletAddress: 'test_wallet',
    };

    it('should call service.sendAssetToVendorByWalletAddress with correct parameters', async () => {
      const expectedResult = { txHash: 'test_hash' };
      service.sendAssetToVendorByWalletAddress.mockResolvedValue(
        expectedResult
      );

      const result = await controller.sendAssetToVendorByWalletAddress(
        mockSendAssetByWalletAddressDto
      );
      expect(result).toEqual(expectedResult);
      expect(service.sendAssetToVendorByWalletAddress).toHaveBeenCalledWith(
        mockSendAssetByWalletAddressDto
      );
    });
  });

  describe('fundStellarAccount', () => {
    const mockFundAccountDto: FundAccountDto = {
      walletAddress: 'test_address',
      secretKey: 'test_secret',
    };

    it('should call service.faucetAndTrustlineService with correct parameters', async () => {
      const expectedResult = { message: 'Account funded successfully' };
      service.faucetAndTrustlineService.mockResolvedValue(expectedResult);

      const result = await controller.fundStellarAccount(mockFundAccountDto);
      expect(result).toEqual(expectedResult);
      expect(service.faucetAndTrustlineService).toHaveBeenCalledWith(
        mockFundAccountDto
      );
    });
  });

  describe('checkTrustline', () => {
    const mockCheckTrustlineDto: CheckTrustlineDto = {
      walletAddress: 'test_address',
    };

    it('should call service.checkTrustline with correct parameters', async () => {
      const expectedResult = true;
      service.checkTrustline.mockResolvedValue(expectedResult);

      const result = await controller.checkTrustline(mockCheckTrustlineDto);
      expect(result).toEqual(expectedResult);
      expect(service.checkTrustline).toHaveBeenCalledWith(
        mockCheckTrustlineDto
      );
    });
  });

  describe('getDisbursementStats', () => {
    it('should call service.getDisbursementStats', async () => {
      const expectedResult = {
        tokenStats: [
          { name: 'Disbursement Balance', amount: '1,000' },
          { name: 'Disbursed Balance', amount: '500' },
          { name: 'Remaining Balance', amount: '500' },
          { name: 'Token Price', amount: 'Rs 10' },
        ],
        transactionStats: [
          {
            title: 'RAHAT',
            subtitle: 'test_source',
            date: '2024-03-20',
            amount: '100',
            amtColor: 'green',
            hash: 'test_hash',
          },
        ],
      };
      service.getDisbursementStats.mockResolvedValue(expectedResult);

      const result = await controller.getDisbursementStats();
      expect(result).toEqual(expectedResult);
      expect(service.getDisbursementStats).toHaveBeenCalled();
    });
  });

  describe('getWalletStats', () => {
    const mockGetWalletBalanceDto: GetWalletBalanceDto = {
      address: 'test_address',
    };

    it('should call service.getWalletStats with correct parameters', async () => {
      const expectedResult = {
        balances: [
          {
            balance: '250',
            limit: '10',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
            last_modified_ledger: 1220063,
            is_authorized: true,
            is_authorized_to_maintain_liabilities: true,
            asset_type: 'credit_alphanum12',
            asset_code: 'RAHAT',
            asset_issuer:
              'GCVLRQHGZYG32HZE3PKZ52NX5YFCNFDBUZDLUXQYMRS6WVBWSUOP5IYK',
          },
          {
            balance: '9999',
            buying_liabilities: '0',
            selling_liabilities: '0',
            asset_type: 'native',
          },
        ],
        transactions: [
          {
            title: 'VENDOR',
            subtitle:
              'GDTGK77GFYWNXDTZC2LSFKTTPC7RLS223BNFW6WLOMDS7ZFR6YF2XXAU',
            date: '2025-05-29T09:35:14.377Z',
            amount: '100',
            hash: '5c8b3c2f3b0c4b632bc68e7d1076a18fc53d9a29eba02711aa86d1ac50424640',
            beneficiaryName: 'Akash Sunar',
          },
        ],
      };
      (service.getWalletStats as jest.Mock).mockResolvedValue(expectedResult);

      const result = await controller.getWalletStats(mockGetWalletBalanceDto);
      expect(result).toEqual(expectedResult);
      expect(service.getWalletStats).toHaveBeenCalledWith(
        mockGetWalletBalanceDto
      );
    });
  });

  describe('getTriggerWithID', () => {
    const mockGetTriggerDto: GetTriggerDto = {
      id: 'trigger1',
    };

    it('should call service.getTriggerWithID with correct parameters', async () => {
      const expectedResult = {
        id: 'trigger1',
        status: 'ACTIVE',
      };
      service.getTriggerWithID.mockResolvedValue(expectedResult);

      const result = await controller.getTriggerWithID(mockGetTriggerDto);
      expect(result).toEqual(expectedResult);
      expect(service.getTriggerWithID).toHaveBeenCalledWith(mockGetTriggerDto);
    });
  });

  describe('addTriggerOnChain', () => {
    const mockAddTriggerDto: AddTriggerDto[] = [
      {
        id: 'trigger1',
        trigger_type: 'test',
        phase: 'test',
        title: 'Test Trigger',
        source: 'test',
        river_basin: 'test',
        params: { test: 'value' } as unknown as JSON,
        is_mandatory: true,
      },
    ];

    it('should call service.addTriggerOnChain with correct parameters', async () => {
      const expectedResult = { id: 'job1' } as Job;
      service.addTriggerOnChain.mockResolvedValue(expectedResult);

      const result = await controller.addTriggerOnChain(mockAddTriggerDto);
      expect(result).toEqual(expectedResult);
      expect(service.addTriggerOnChain).toHaveBeenCalledWith(mockAddTriggerDto);
    });
  });

  describe('updateOnchainTrigger', () => {
    const mockUpdateTriggerParamsDto: UpdateTriggerParamsDto = {
      id: 'trigger1',
      params: { test: 'value' },
    };

    it('should call service.updateOnchainTrigger with correct parameters', async () => {
      const expectedResult = { id: 'job1' } as Job;
      service.updateOnchainTrigger.mockResolvedValue(expectedResult);

      const result = await controller.updateOnchainTrigger(
        mockUpdateTriggerParamsDto
      );
      expect(result).toEqual(expectedResult);
      expect(service.updateOnchainTrigger).toHaveBeenCalledWith(
        mockUpdateTriggerParamsDto
      );
    });
  });
});
