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
import { GroupPurpose } from '@prisma/client';

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
              groupPurpose: GroupPurpose.BANK_TRANSFER,
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
      vendorUuid: 'vendor-uuid-123',
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
      amount: 100,
      phoneNumber: '+1234567890',
      receiverAddress: 'receiver_address',
      otp: '123456',
    };

    it('should call service.sendAssetToVendor with correct parameters', async () => {
      const expectedResult = {
        txHash: 'test_transaction_hash',
      };
      service.sendAssetToVendor.mockResolvedValue(expectedResult);

      const result = await controller.sendAssetToVendor(mockSendAssetDto);
      expect(result).toEqual(expectedResult);
      expect(service.sendAssetToVendor).toHaveBeenCalledWith(mockSendAssetDto);
    });
  });

  describe('sendAssetToVendorByWalletAddress', () => {
    const mockSendAssetByWalletAddressDto: SendAssetByWalletAddressDto = {
      amount: 100,
      walletAddress: 'wallet_address',
      receiverAddress: 'receiver_address',
    };

    it('should call service.sendAssetToVendorByWalletAddress with correct parameters', async () => {
      const expectedResult = {
        txHash: 'test_transaction_hash',
      };
      service.sendAssetToVendorByWalletAddress.mockResolvedValue(expectedResult);

      const result = await controller.sendAssetToVendorByWalletAddress(
        mockSendAssetByWalletAddressDto
      );
      expect(result).toEqual(expectedResult);
      expect(service.sendAssetToVendorByWalletAddress).toHaveBeenCalledWith(
        mockSendAssetByWalletAddressDto
      );
    });
  });

  // describe('transferToOfframpJobs', () => {
  //   const mockTransferToOfframpDto: TransferToOfframpDto = {
  //     offRampWalletAddress: 'offramp_address',
  //     beneficiaryWalletAddress: ['wallet1', 'wallet2'],
  //   };

  //   it('should call service.transferToOfframpJobs with correct parameters', async () => {
  //     const expectedResult = {
  //       message: 'Transfer to offramp jobs added for 2 beneficiaries',
  //       beneficiaries: [
  //         { walletAddress: 'wallet1', status: 'PENDING' },
  //         { walletAddress: 'wallet2', status: 'PENDING' },
  //       ],
  //     };
  //     service.transferToOfframpJobs.mockResolvedValue(expectedResult);

  //     const result = await controller.transferToOfframpJobs(mockTransferToOfframpDto);
  //     expect(result).toEqual(expectedResult);
  //     expect(service.transferToOfframpJobs).toHaveBeenCalledWith(mockTransferToOfframpDto);
  //   });
  // });

  describe('fundStellarAccount', () => {
    const mockFundAccountDto: FundAccountDto = {
      walletAddress: 'test_wallet_address',
      secretKey: 'test_secret_key',
    };

    it('should call service.faucetAndTrustlineService with correct parameters', async () => {
      const expectedResult = {
        success: true,
        message: 'Faucet and trustline setup successful',
      };
      service.faucetAndTrustlineService.mockResolvedValue(expectedResult);

      const result = await controller.fundStellarAccount(mockFundAccountDto);
      expect(result).toEqual(expectedResult);
      expect(service.faucetAndTrustlineService).toHaveBeenCalledWith(mockFundAccountDto);
    });
  });

  describe('checkTrustline', () => {
    const mockCheckTrustlineDto: CheckTrustlineDto = {
      walletAddress: 'test_wallet_address',
    };

    it('should call service.checkTrustline with correct parameters', async () => {
      const expectedResult = true;
      service.checkTrustline.mockResolvedValue(expectedResult);

      const result = await controller.checkTrustline(mockCheckTrustlineDto);
      expect(result).toEqual(expectedResult);
      expect(service.checkTrustline).toHaveBeenCalledWith(mockCheckTrustlineDto);
    });
  });

  describe('getDisbursementStats', () => {
    it('should call service.getDisbursementStats and return stats', async () => {
      const expectedResult = [
        { name: 'Token Disbursed', value: 1000 },
        { name: 'Budget Assigned', value: 10000 },
        { name: 'Token', value: 'RAHAT' },
        { name: 'Token Price', value: 10 },
        { name: 'Total Beneficiaries', value: 100 },
        { name: 'Average Disbursement time', value: '2 hours' },
        { name: 'Average Duration', value: '1 day' },
      ];
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
            asset_type: 'credit_alphanum4',
            asset_code: 'RAHAT',
            balance: '1000.0000000',
          },
        ],
        transactions: [
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
      service.getWalletStats.mockResolvedValue(expectedResult);

      const result = await controller.getWalletStats(mockGetWalletBalanceDto);
      expect(result).toEqual(expectedResult);
      expect(service.getWalletStats).toHaveBeenCalledWith(mockGetWalletBalanceDto);
    });
  });

  describe('getTriggerWithID', () => {
    const mockGetTriggerDto: GetTriggerDto = {
      id: 'test_trigger_id',
    };

    it('should call service.getTriggerWithID with correct parameters', async () => {
      const expectedResult = {
        id: 'test_trigger_id',
        trigger_type: 'sample_type',
        phase: 'sample_phase',
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
        trigger_type: 'type1',
        phase: 'phase1',
        title: 'Sample Trigger',
        source: 'source1',
        river_basin: 'sample_basin',
        params: JSON.parse('{"data": "sample_data"}'),
        is_mandatory: true,
      },
    ];

    it('should call service.addTriggerOnChain with correct parameters', async () => {
      const expectedResult = {
        id: 'job123',
        data: { triggers: mockAddTriggerDto },
        opts: { attempts: 3 },
      };
      service.addTriggerOnChain.mockResolvedValue(expectedResult as any);

      const result = await controller.addTriggerOnChain(mockAddTriggerDto);
      expect(result).toEqual(expectedResult);
      expect(service.addTriggerOnChain).toHaveBeenCalledWith(mockAddTriggerDto);
    });
  });

  describe('updateOnchainTrigger', () => {
    const mockUpdateTriggerParamsDto: UpdateTriggerParamsDto = {
      id: 'trigger1',
      params: JSON.parse('{"updated_data": "new_value"}'),
    };

    it('should call service.updateOnchainTrigger with correct parameters', async () => {
      const expectedResult = {
        id: 'job456',
        data: mockUpdateTriggerParamsDto,
        opts: { attempts: 3 },
      };
      service.updateOnchainTrigger.mockResolvedValue(expectedResult as any);

      const result = await controller.updateOnchainTrigger(mockUpdateTriggerParamsDto);
      expect(result).toEqual(expectedResult);
      expect(service.updateOnchainTrigger).toHaveBeenCalledWith(mockUpdateTriggerParamsDto);
    });
  });
});
