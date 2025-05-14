import { Test, TestingModule } from '@nestjs/testing';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';

describe('StellarController', () => {
  let controller: StellarController;
  let service: StellarService;

  const mockStellarService = {
    disburse: jest.fn(),
    sendOtp: jest.fn(),
    sendAssetToVendor: jest.fn(),
    faucetAndTrustlineService: jest.fn(),
    addTriggerOnChain: jest.fn(),
    getDisbursementStats: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: 'RAHAT_CORE_PROJECT_CLIENT',
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: 'BullQueue_STELLAR',
          useValue: mockBullQueueStellar,
        },
      ],
    }).compile();

    controller = module.get<StellarController>(StellarController);
    service = module.get<StellarService>(StellarService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('disburse', () => {
    const mockDisburseDto = {
      dName: 'test_disbursement',
      groups: ['group1', 'group2'],
    };

    it('should call service.disburse with correct parameters', async () => {
      mockStellarService.disburse.mockResolvedValue({ success: true });
      
      const result = await controller.disburse(mockDisburseDto);
      
      expect(service.disburse).toHaveBeenCalledWith(mockDisburseDto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('sendOtp', () => {
    const mockSendOtpDto = {
      phoneNumber: '+1234567890',
      amount: '100',
    };

    it('should call service.sendOtp with correct parameters', async () => {
      mockStellarService.sendOtp.mockResolvedValue({ id: 1 });
      
      const result = await controller.sendOtp(mockSendOtpDto);
      
      expect(service.sendOtp).toHaveBeenCalledWith(mockSendOtpDto);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('sendAssetToVendor', () => {
    const mockSendAssetDto = {
      phoneNumber: '+1234567890',
      otp: '123456',
      receiverAddress: 'stellar_address',
      amount: '100',
    };

    it('should call service.sendAssetToVendor with correct parameters', async () => {
      mockStellarService.sendAssetToVendor.mockResolvedValue({ success: true });
      
      const result = await controller.sendAssetToVendor(mockSendAssetDto);
      
      expect(service.sendAssetToVendor).toHaveBeenCalledWith(mockSendAssetDto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('fundStellarAccount', () => {
    const mockFundAccountDto = {
      walletAddress: 'stellar_address',
      secretKey: 'secret_key',
    };

    it('should call service.faucetAndTrustlineService with correct parameters', async () => {
      mockStellarService.faucetAndTrustlineService.mockResolvedValue({ success: true });
      
      const result = await controller.fundStellarAccount(mockFundAccountDto);
      
      expect(service.faucetAndTrustlineService).toHaveBeenCalledWith(mockFundAccountDto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('addTriggerOnChain', () => {
    const mockTrigger = {
      id: 'trigger1',
      trigger_type: 'type1',
      phase: 'phase1',
      title: 'Sample Trigger',
      source: 'source1',
      river_basin: 'sample_basin',
      params: Object.create({data: 'sample_data'}),
      is_mandatory: true,
    };

    it('should call service.addTriggerOnChain with correct parameters', async () => {
      mockStellarService.addTriggerOnChain.mockResolvedValue({ success: true });

      const result = await controller.addTriggerOnChain([mockTrigger]);

      expect(service.addTriggerOnChain).toHaveBeenCalledWith([mockTrigger]); // Fix: Pass an array
      expect(result).toEqual({ success: true });
    });
  });

  describe('getDisbursementStats', () => {
    it('should call service.getDisbursementStats', async () => {
      const mockStats = {
        tokenStats: [],
        transactionStats: [],
      };
      mockStellarService.getDisbursementStats.mockResolvedValue(mockStats);
      
      const result = await controller.getDisbursementStats();
      
      expect(service.getDisbursementStats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });
});
