import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { DisbursementServices, ReceiveService, TransactionService } from '@rahataid/stellar-sdk';
import { of } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';
import { BQUEUE, CORE_MODULE } from '../constants';
import { AppService } from '../app/app.service';
import { getQueueToken } from '@nestjs/bull';

jest.mock('@rahataid/stellar-sdk');
jest.mock('bcryptjs');

describe('StellarService', () => {
  let service: StellarService;
  let clientProxy: jest.Mocked<ClientProxy>;
  let prismaService: jest.Mocked<PrismaService>;
  let settingsService: jest.Mocked<SettingsService>;
  let receiveService: jest.Mocked<ReceiveService>;
  let transactionService: jest.Mocked<TransactionService>;
  let disbursementServices: jest.Mocked<DisbursementServices>;
  let appService: jest.Mocked<AppService>;

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockPrismaService = {
    beneficiaryGroupTokens: {
      findMany: jest.fn(),
    },
    otp: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    beneficiaryGroups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    vendor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    beneficiaryRedeem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
        ASSETCODE: 'RAHAT',
        ONE_TOKEN_PRICE: 1,
      },
    }),
  };

  const mockBullQueueStellar = {
    add: jest.fn(),
    addBulk: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockBullQueueCheckTrustline = {
    add: jest.fn(),
    addBulk: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockReceiveService = {
    sendAsset: jest.fn(),
    faucetAndTrustlineService: jest.fn(),
    getAccountBalance: jest.fn(),
  };

  const mockTransactionService = {
    hasTrustline: jest.fn(),
    rahatFaucetService: jest.fn(),
    getTransaction: jest.fn(),
  };

  const mockDisbursementServices = {
    createDisbursementProcess: jest.fn(),
    getDistributionAddress: jest.fn().mockResolvedValue('test_address'),
    getDisbursement: jest.fn(),
  };

  const mockAppService = {
    getSettings: jest.fn().mockResolvedValue({
      name: 'PROJECTINFO',
      value: {
        active_year: '2024',
        river_basin: 'test-basin',
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: CORE_MODULE,
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
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR),
          useValue: mockBullQueueStellar,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR_CHECK_TRUSTLINE),
          useValue: mockBullQueueCheckTrustline,
        },
        {
          provide: ReceiveService,
          useValue: mockReceiveService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: DisbursementServices,
          useValue: mockDisbursementServices,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    clientProxy = module.get(CORE_MODULE);
    prismaService = module.get(PrismaService);
    settingsService = module.get(SettingsService);
    receiveService = module.get(ReceiveService);
    transactionService = module.get(TransactionService);
    disbursementServices = module.get(DisbursementServices);
    appService = module.get(AppService);

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
      mockDisbursementServices.createDisbursementProcess.mockResolvedValue({
        success: true,
      });
    });

    it('should successfully create a disbursement process', async () => {
      const result = await service.disburse(mockDiburseDto);
      expect(result).toEqual({ success: true });
      expect(mockDisbursementServices.createDisbursementProcess).toHaveBeenCalled();
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
      vendorUuid: 'vendor-uuid-123',
    };

    const mockPayoutType = {
      uuid: 'payout-uuid-123',
      type: 'VENDOR',
      mode: 'ONLINE',
    };

    const mockVendor = {
      uuid: 'vendor-uuid-123',
      walletAddress: 'vendor-wallet-address',
    };

    const mockBeneficiaryKeys = {
      address: 'beneficiary-address',
      publicKey: 'beneficiary-public-key',
      privateKey: 'beneficiary-private-key',
    };

    beforeEach(() => {
      // Set up the spy for getBeneficiaryPayoutTypeByPhone first
      jest.spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone').mockResolvedValue(mockPayoutType);
      jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);
      jest.spyOn(service as any, 'getSecretByPhone').mockResolvedValue(mockBeneficiaryKeys);
      jest.spyOn(service as any, 'storeOTP').mockResolvedValue({ id: 1 });
      
      // Mock the external dependencies
      mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedOtp');
      mockPrismaService.otp.upsert.mockResolvedValue({ id: 1 });
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryRedeem.create.mockResolvedValue({ uuid: 'redeem-uuid' });
    });

    it('should successfully send and store OTP', async () => {
      const result = await service.sendOtp(mockSendOtpDto);
      expect(result).toEqual({ id: 1 });
      expect(mockClientProxy.send).toHaveBeenCalled();
      expect(service['getBeneficiaryPayoutTypeByPhone']).toHaveBeenCalledWith(mockSendOtpDto.phoneNumber);
      expect(service['storeOTP']).toHaveBeenCalled();
    });

    it('should throw RpcException if payout type is not VENDOR', async () => {
      jest.spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone').mockResolvedValue({
        ...mockPayoutType,
        type: 'CASH',
      });

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout type is not VENDOR')
      );
    });

    it('should throw RpcException if payout mode is not ONLINE', async () => {
      jest.spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone').mockResolvedValue({
        ...mockPayoutType,
        mode: 'OFFLINE',
      });

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout mode is not ONLINE')
      );
    });

    it('should throw RpcException if payout not initiated', async () => {
      jest.spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone').mockResolvedValue(null);

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout not initiated')
      );
    });
  });

  // describe('addTriggerOnChain', () => {
  //   const mockTrigger = {
  //     id: 'trigger1',
  //     trigger_type: 'type1',
  //     phase: 'phase1',
  //     title: 'Sample Trigger',
  //     source: 'source1',
  //     river_basin: 'sample_basin',
  //     params: Object.create({ data: 'sample_data' }),
  //     is_mandatory: true,
  //   };

  //   it('should successfully add trigger on chain', async () => {
  //     (service as any).createTransaction = jest.fn().mockResolvedValue({});
  //     jest.spyOn(service as any, 'prepareSignAndSend').mockResolvedValue({ success: true });

  //     const result = await service.addTriggerOnChain([mockTrigger]);
  //     expect(result).toEqual({ success: true });
  //   });
  // });
});
