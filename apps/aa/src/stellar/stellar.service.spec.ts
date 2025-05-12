import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { DisbursementServices, ReceiveService, TransactionService } from '@rahataid/stellar-sdk';
import { of } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';

jest.mock('@rahataid/stellar-sdk');
jest.mock('bcryptjs');

describe('StellarService', () => {
  let service: StellarService;
  let clientProxy: jest.Mocked<ClientProxy>;
  let prismaService: jest.Mocked<PrismaService>;
  let settingsService: jest.Mocked<SettingsService>;

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockPrismaService = {
    beneficiaryGroupTokens: {
      findMany: jest.fn(),
    },
    otp: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    beneficiaryGroups: {
      findMany: jest.fn(),
    },
  };

  const mockSettingsService = {
    getPublic: jest.fn().mockResolvedValue({
      value: {
        EMAIL: 'test@example.com',
        PASSWORD: 'password',
        TENANTNAME: 'test_tenant',
        SERVER: 'test_server',
        KEYPAIR: 'test_keypair',
        CONTRACTID: 'test_contract',
        VENDORADDRESS: 'test_vendor',
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: 'RAHAT_CORE_PROJECT_CLIENT',
          useValue: mockClientProxy,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    clientProxy = module.get('RAHAT_CORE_PROJECT_CLIENT');
    prismaService = module.get(PrismaService);
    settingsService = module.get(SettingsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('disburse', () => {
    const mockDiburseDto = {
      dName: 'test_disbursement',
      groups: ['group1', 'group2'],
    };

    const mockBeneficiaries = [
      { walletAddress: 'addr1', amount: '100', phone: '9841234567', id: 'ben1' },
      { walletAddress: 'addr2', amount: '200', phone: '9847654321', id: 'ben2' },
    ];

    beforeEach(() => {
      jest.spyOn(service as any, 'getBeneficiaryTokenBalance').mockResolvedValue(mockBeneficiaries);
      (DisbursementServices.prototype.createDisbursementProcess as jest.Mock).mockResolvedValue({
        success: true,
      });
    });

    it('should successfully create a disbursement process', async () => {
      const result = await service.disburse(mockDiburseDto);
      expect(result).toEqual({ success: true });
      expect(DisbursementServices.prototype.createDisbursementProcess).toHaveBeenCalled();
    });

    /*
    it('should throw RpcException when no beneficiaries found', async () => {
      jest.spyOn(service as any, 'getBeneficiaryTokenBalance').mockResolvedValue([]);
      await expect(service.disburse(mockDiburseDto)).rejects.toThrow(RpcException);
    });
    */
  });

  describe('sendOtp', () => {
    const mockSendOtpDto = {
      phoneNumber: '+1234567890',
      amount: '100',
    };

    beforeEach(() => {
      mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedOtp');
      mockPrismaService.otp.upsert.mockResolvedValue({ id: 1 });
    });

    it('should successfully send and store OTP', async () => {
      const result = await service.sendOtp(mockSendOtpDto);
      expect(result).toEqual({ id: 1 });
      expect(mockClientProxy.send).toHaveBeenCalled();
      expect(mockPrismaService.otp.upsert).toHaveBeenCalled();
    });
  });

  describe('sendAssetToVendor', () => {
    const mockSendAssetDto = {
      phoneNumber: '+1234567890',
      otp: '123456',
      receiverAddress: 'stellar_address',
      amount: '100',
    };

    beforeEach(() => {
      jest.spyOn(service as any, 'verifyOTP').mockResolvedValue(true);
      jest.spyOn(service as any, 'getSecretByPhone').mockResolvedValue({
        privateKey: 'private_key',
      });
      (ReceiveService.prototype.sendAsset as jest.Mock).mockResolvedValue({
        success: true,
      });
    });

    it('should successfully send asset to vendor', async () => {
      const result = await service.sendAssetToVendor(mockSendAssetDto);
      expect(result).toEqual({ success: true });
    });

    it('should throw error when OTP verification fails', async () => {
      jest.spyOn(service as any, 'verifyOTP').mockRejectedValue(new Error('Invalid OTP'));
      await expect(service.sendAssetToVendor(mockSendAssetDto)).rejects.toThrow('Invalid OTP');
    });
  });

  describe('getDisbursementStats', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'getRahatBalance').mockResolvedValue(1000);
      jest.spyOn(service as any, 'getRecentTransaction').mockResolvedValue([]);
    });

    it('should return disbursement statistics', async () => {
      const result = await service.getDisbursementStats();
      expect(result).toHaveProperty('tokenStats');
      expect(result).toHaveProperty('transactionStats');
    });
  });

  describe('faucetAndTrustlineService', () => {
    const mockFundAccountDto = {
      walletAddress: 'test_address',
      secretKey: 'test_secret',
    };

    it('should call receiveService.faucetAndTrustlineService with correct parameters', async () => {
      (ReceiveService.prototype.faucetAndTrustlineService as jest.Mock).mockResolvedValue({
        success: true,
      });

      const result = await service.faucetAndTrustlineService(mockFundAccountDto);
      expect(result).toEqual({ success: true });
      expect(ReceiveService.prototype.faucetAndTrustlineService).toHaveBeenCalledWith(
        mockFundAccountDto.walletAddress,
        mockFundAccountDto.secretKey
      );
    });
  });

  describe('addTriggerOnChain', () => {
    const mockTrigger = {
      id: 'trigger1',
    };

    it('should successfully add trigger on chain', async () => {
      jest.spyOn(service as any, 'createTransaction').mockResolvedValue({});
      jest.spyOn(service as any, 'prepareSignAndSend').mockResolvedValue({ success: true });

      const result = await service.addTriggerOnChain(mockTrigger);
      expect(result).toEqual({ success: true });
    });
  });
});
