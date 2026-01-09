import { Test, TestingModule } from '@nestjs/testing';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { PrismaService } from '@rumsan/prisma';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';
import { CORE_MODULE, BQUEUE } from '../constants';
import { ClientProxy } from '@nestjs/microservices';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

describe('VendorsModule', () => {
  let module: TestingModule;
  let vendorsService: VendorsService;
  let vendorsController: VendorsController;
  let receiveService: ReceiveService;

  const mockPrismaService = {
    vendor: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    payouts: {
      findMany: jest.fn(),
    },
    beneficiaryRedeem: {
      findMany: jest.fn(),
    },
    beneficiaryGroups: {
      findMany: jest.fn(),
    },
    beneficiaryGroupTokens: {
      findMany: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
    },
  };

  const mockClientProxy = {
    send: jest.fn(),
    emit: jest.fn(),
    close: jest.fn(),
    connect: jest.fn(),
  };

  const mockSettingsService = {
    getPublic: jest.fn(),
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

  const mockVendorQueue = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockReceiveService = {
    getAccountBalance: jest.fn(),
  };

  const mockVendorTokenRedemptionService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
    getVendorRedemptions: jest.fn(),
    getVendorTokenRedemptionStats: jest.fn(),
  };

  const mockVendorCVAPayoutQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    // Mock the SettingsService to return stellar settings
    mockSettingsService.getPublic.mockResolvedValue({
      value: {
        ASSETCREATOR: 'test-asset-creator',
        ASSETCODE: 'RAHAT',
        NETWORK: 'TESTNET',
        FAUCETSECRETKEY: 'test-secret-key',
        FUNDINGAMOUNT: '1000',
        HORIZONURL: 'https://horizon-testnet.stellar.org',
      },
    });

    module = await Test.createTestingModule({
      controllers: [VendorsController],
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
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            return new ReceiveService(
              settings?.value['ASSETCREATOR'],
              settings?.value['ASSETCODE'],
              settings?.value['NETWORK'],
              settings?.value['FAUCETSECRETKEY'],
              settings?.value['FUNDINGAMOUNT'],
              settings?.value['HORIZONURL']
            );
          },
          inject: [SettingsService],
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: VendorTokenRedemptionService,
          useValue: mockVendorTokenRedemptionService,
        },
        {
          provide: getQueueToken(BQUEUE.VENDOR_OFFLINE),
          useValue: mockVendorOfflineQueue,
        },
        {
          provide: getQueueToken(BQUEUE.BATCH_TRANSFER),
          useValue: mockBatchTransferQueue,
        },
      ],
    }).compile();

    vendorsService = module.get<VendorsService>(VendorsService);
    vendorsController = module.get<VendorsController>(VendorsController);
    receiveService = module.get<ReceiveService>(ReceiveService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should create VendorsService', () => {
    expect(vendorsService).toBeDefined();
    expect(vendorsService).toBeInstanceOf(VendorsService);
  });

  it('should create VendorsController', () => {
    expect(vendorsController).toBeDefined();
    expect(vendorsController).toBeInstanceOf(VendorsController);
  });

  it('should create ReceiveService with correct configuration', () => {
    expect(receiveService).toBeDefined();
    expect(receiveService).toBeInstanceOf(ReceiveService);
    expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
      'STELLAR_SETTINGS'
    );
  });

  it('should have correct module dependencies', () => {
    // Check that PrismaService is available
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();

    // Check that CORE_MODULE ClientProxy is available
    const clientProxy = module.get<ClientProxy>(CORE_MODULE);
    expect(clientProxy).toBeDefined();
  });

  it('should export VendorsService', () => {
    const exportedVendorsService = module.get<VendorsService>(VendorsService);
    expect(exportedVendorsService).toBeDefined();
    expect(exportedVendorsService).toBe(vendorsService);
  });

  it('should export ReceiveService', () => {
    const exportedReceiveService = module.get<ReceiveService>(ReceiveService);
    expect(exportedReceiveService).toBeDefined();
    expect(exportedReceiveService).toBe(receiveService);
  });

  it('should properly configure providers with correct dependencies', () => {
    // This test verifies that the providers are correctly configured
    expect(module).toBeDefined();

    // Verify that all required dependencies are available
    const clientProxy = module.get<ClientProxy>(CORE_MODULE);
    const settingsService = module.get<SettingsService>(SettingsService);
    expect(clientProxy).toBeDefined();
    expect(settingsService).toBeDefined();
  });

  it('should handle ReceiveService factory creation with missing settings', async () => {
    // Test scenario where settings are not available
    const moduleWithoutSettings = await Test.createTestingModule({
      controllers: [VendorsController],
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
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            return new ReceiveService(
              settings?.value?.['ASSETCREATOR'],
              settings?.value?.['ASSETCODE'],
              settings?.value?.['NETWORK'],
              settings?.value?.['FAUCETSECRETKEY'],
              settings?.value?.['FUNDINGAMOUNT'],
              settings?.value?.['HORIZONURL']
            );
          },
          inject: [SettingsService],
        },
        {
          provide: SettingsService,
          useValue: {
            getPublic: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: VendorTokenRedemptionService,
          useValue: mockVendorTokenRedemptionService,
        },
        {
          provide: getQueueToken(BQUEUE.VENDOR_OFFLINE),
          useValue: mockVendorOfflineQueue,
        },
        {
          provide: getQueueToken(BQUEUE.BATCH_TRANSFER),
          useValue: mockBatchTransferQueue,
        },
      ],
    }).compile();

    const receiveServiceWithoutSettings =
      moduleWithoutSettings.get<ReceiveService>(ReceiveService);
    expect(receiveServiceWithoutSettings).toBeDefined();

    await moduleWithoutSettings.close();
  });

  it('should handle ReceiveService factory creation with empty settings', async () => {
    // Test scenario where settings value is empty
    const moduleWithEmptySettings = await Test.createTestingModule({
      controllers: [VendorsController],
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
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            return new ReceiveService(
              settings?.value?.['ASSETCREATOR'],
              settings?.value?.['ASSETCODE'],
              settings?.value?.['NETWORK'],
              settings?.value?.['FAUCETSECRETKEY'],
              settings?.value?.['FUNDINGAMOUNT'],
              settings?.value?.['HORIZONURL']
            );
          },
          inject: [SettingsService],
        },
        {
          provide: SettingsService,
          useValue: {
            getPublic: jest.fn().mockResolvedValue({ value: {} }),
          },
        },
        {
          provide: VendorTokenRedemptionService,
          useValue: mockVendorTokenRedemptionService,
        },
        {
          provide: getQueueToken(BQUEUE.VENDOR_OFFLINE),
          useValue: mockVendorOfflineQueue,
        },
        {
          provide: getQueueToken(BQUEUE.BATCH_TRANSFER),
          useValue: mockBatchTransferQueue,
        },
      ],
    }).compile();

    const receiveServiceWithEmptySettings =
      moduleWithEmptySettings.get<ReceiveService>(ReceiveService);
    expect(receiveServiceWithEmptySettings).toBeDefined();

    await moduleWithEmptySettings.close();
  });

  it('should inject SettingsService into ReceiveService factory', () => {
    // Verify that SettingsService was injected and called
    expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
      'STELLAR_SETTINGS'
    );
  });
});
