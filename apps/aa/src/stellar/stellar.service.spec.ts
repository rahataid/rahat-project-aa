import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import {
  DisbursementService,
  TransactionService,
} from '@rahataid/stellar-sdk-v2';
import { of } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';
import { CORE_MODULE } from '../constants';

jest.mock('@rahataid/stellar-sdk');
jest.mock('bcryptjs');

describe('StellarService', () => {
  let service: StellarService;
  let clientProxy: jest.Mocked<ClientProxy>;
  let prismaService: jest.Mocked<PrismaService>;
  let settingsService: jest.Mocked<SettingsService>;
  let transactionService: jest.Mocked<TransactionService>;
  let disbursementServices: jest.Mocked<DisbursementService>;

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
    },
    vendor: {
      findUnique: jest.fn(),
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

  const mockBullQueueStellar = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockReceiveService = {
    sendAsset: jest.fn(),
  };

  const mockTransactionService = {
    // Add any required methods
  };

  const mockDisbursementServices = {
    createDisbursementProcess: jest.fn(),
    getDistributionAddress: jest.fn().mockResolvedValue('test_address'),
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
          provide: 'BullQueue_STELLAR',
          useValue: mockBullQueueStellar,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: DisbursementService,
          useValue: mockDisbursementServices,
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    clientProxy = module.get(CORE_MODULE);
    prismaService = module.get(PrismaService);
    settingsService = module.get(SettingsService);
    transactionService = module.get(TransactionService);
    disbursementServices = module.get(DisbursementService);

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
      {
        walletAddress: 'addr1',
        amount: '100',
        phone: '9841234567',
        id: 'ben1',
      },
      {
        walletAddress: 'addr2',
        amount: '200',
        phone: '9847654321',
        id: 'ben2',
      },
    ];

    beforeEach(() => {
      jest
        .spyOn(service as any, 'getBeneficiaryTokenBalance')
        .mockResolvedValue(mockBeneficiaries);
      mockDisbursementServices.createDisbursementProcess.mockResolvedValue({
        success: true,
      });
    });

    it('should successfully create a disbursement process', async () => {
      const result = await service.disburse(mockDiburseDto);
      expect(result).toEqual({ success: true });
      expect(
        mockDisbursementServices.createDisbursementProcess
      ).toHaveBeenCalled();
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
      jest.spyOn(service as any, 'getRahatBalance').mockResolvedValue(1000);
    });

    it('should successfully send and store OTP', async () => {
      const result = await service.sendOtp(mockSendOtpDto);
      expect(result).toEqual({ id: 1 });
      expect(mockClientProxy.send).toHaveBeenCalled();
      expect(mockPrismaService.otp.upsert).toHaveBeenCalled();
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
