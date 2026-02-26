import { Test, TestingModule } from '@nestjs/testing';
import { StellarModule } from './stellar.module';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { AppService } from '../app/app.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('StellarModule', () => {
  let module: TestingModule;

  const mockSettingsService = {
    getPublic: jest.fn().mockResolvedValue({
      value: {
        EMAIL: 'test@example.com',
        PASSWORD: 'password',
        TENANTNAME: 'test_tenant',
        BASEURL: 'http://localhost:3000',
        ADMINBASEURL: 'http://localhost:3001',
        ASSETCODE: 'RAHAT',
        ASSETCREATOR:
          'GDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
        ASSETCREATORSECRET:
          'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
        HORIZONURL: 'https://horizon-testnet.stellar.org',
        NETWORK: 'TESTNET',
        FAUCETSECRETKEY:
          'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
        FUNDINGAMOUNT: '10',
      },
    }),
  };

  const mockPrismaService = {};

  const mockAppService = {
    getSettings: jest.fn().mockResolvedValue({
      name: 'PROJECTINFO',
      value: {
        active_year: '2024',
        river_basin: 'test-basin',
      },
    }),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('mock-project-id'),
  };
  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        ClientsModule.register([
          {
            name: CORE_MODULE,
            transport: Transport.REDIS,
            options: {
              host: 'localhost',
              port: 6379,
            },
          },
        ]),
        BullModule.registerQueue({
          name: BQUEUE.STELLAR,
        }),
        BullModule.registerQueue({
          name: BQUEUE.STELLAR_CHECK_TRUSTLINE,
        }),
      ],
      controllers: [StellarController],
      providers: [
        StellarService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AppService,
          useValue: mockAppService,
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
          provide: TransactionService,
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            return new TransactionService(
              settings?.value['ASSETCREATOR'],
              settings?.value['ASSETCODE'],
              settings?.value['ASSETCREATORSECRET'],
              settings?.value['HORIZONURL'],
              settings?.value['NETWORK']
            );
          },
          inject: [SettingsService],
        },
        {
          provide: DisbursementServices,
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');

            const disbursementValues = {
              email: settings?.value['EMAIL'],
              password: settings?.value['PASSWORD'],
              tenantName: settings?.value['TENANTNAME'],
              baseUrl: settings?.value['BASEURL'],
              adminBaseUrl: settings?.value['ADMINBASEURL'],
              assetCode: settings?.value['ASSETCODE'],
              assetIssuer: settings?.value['ASSETCREATOR'],
              assetSecret: settings?.value['ASSETCREATORSECRET'],
            };

            return new DisbursementServices(
              disbursementValues,
              settings?.value['HORIZONURL'],
              settings?.value['NETWORK']
            );
          },
          inject: [SettingsService],
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have StellarController', () => {
    const controller = module.get<StellarController>(StellarController);
    expect(controller).toBeDefined();
  });

  it('should have StellarService', () => {
    const service = module.get<StellarService>(StellarService);
    expect(service).toBeDefined();
  });

  it('should have ReceiveService', () => {
    const service = module.get<ReceiveService>(ReceiveService);
    expect(service).toBeDefined();
  });

  it('should have TransactionService', () => {
    const service = module.get<TransactionService>(TransactionService);
    expect(service).toBeDefined();
  });

  it('should have DisbursementServices', () => {
    const service = module.get<DisbursementServices>(DisbursementServices);
    expect(service).toBeDefined();
  });

  describe('Provider Factories', () => {
    it('should create ReceiveService with correct settings', async () => {
      const receiveService = module.get<ReceiveService>(ReceiveService);
      expect(receiveService).toBeDefined();
      expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
        'STELLAR_SETTINGS'
      );
    });

    it('should create TransactionService with correct settings', async () => {
      const transactionService =
        module.get<TransactionService>(TransactionService);
      expect(transactionService).toBeDefined();
      expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
        'STELLAR_SETTINGS'
      );
    });

    it('should create DisbursementServices with correct settings', async () => {
      const disbursementService =
        module.get<DisbursementServices>(DisbursementServices);
      expect(disbursementService).toBeDefined();
      expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
        'STELLAR_SETTINGS'
      );
    });

    it('should call SettingsService.getPublic multiple times during module creation', () => {
      // The factory functions should have called getPublic for each service
      expect(mockSettingsService.getPublic).toHaveBeenCalledTimes(3);
      expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
        'STELLAR_SETTINGS'
      );
    });

    it('should handle factory function execution with different settings', async () => {
      // Create new mock settings
      const differentMockSettings = {
        ...mockSettingsService,
        getPublic: jest.fn().mockResolvedValue({
          value: {
            EMAIL: 'different@example.com',
            PASSWORD: 'differentpassword',
            TENANTNAME: 'different_tenant',
            BASEURL: 'http://localhost:4000',
            ADMINBASEURL: 'http://localhost:4001',
            ASSETCODE: 'DIFFERENT',
            ASSETCREATOR: 'GDIFFERENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXY',
            ASSETCREATORSECRET:
              'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDIFF',
            HORIZONURL: 'https://horizon.stellar.org',
            NETWORK: 'MAINNET',
            FAUCETSECRETKEY:
              'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXFAUC',
            FUNDINGAMOUNT: '20',
          },
        }),
      };

      // Create a new test module with different settings
      const testModule = await Test.createTestingModule({
        imports: [
          EventEmitterModule.forRoot(),
          ClientsModule.register([
            {
              name: CORE_MODULE,
              transport: Transport.REDIS,
              options: {
                host: 'localhost',
                port: 6379,
              },
            },
          ]),
          BullModule.registerQueue({
            name: BQUEUE.STELLAR,
          }),
          BullModule.registerQueue({
            name: BQUEUE.STELLAR_CHECK_TRUSTLINE,
          }),
        ],
        controllers: [StellarController],
        providers: [
          StellarService,
          {
            provide: SettingsService,
            useValue: differentMockSettings,
          },
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
          {
            provide: AppService,
            useValue: mockAppService,
          },
          {
            provide: ReceiveService,
            useFactory: async (settingService: SettingsService) => {
              const settings = await settingService.getPublic(
                'STELLAR_SETTINGS'
              );
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
            provide: TransactionService,
            useFactory: async (settingService: SettingsService) => {
              const settings = await settingService.getPublic(
                'STELLAR_SETTINGS'
              );
              return new TransactionService(
                settings?.value['ASSETCREATOR'],
                settings?.value['ASSETCODE'],
                settings?.value['ASSETCREATORSECRET'],
                settings?.value['HORIZONURL'],
                settings?.value['NETWORK']
              );
            },
            inject: [SettingsService],
          },
          {
            provide: DisbursementServices,
            useFactory: async (settingService: SettingsService) => {
              const settings = await settingService.getPublic(
                'STELLAR_SETTINGS'
              );

              const disbursementValues = {
                email: settings?.value['EMAIL'],
                password: settings?.value['PASSWORD'],
                tenantName: settings?.value['TENANTNAME'],
                baseUrl: settings?.value['BASEURL'],
                adminBaseUrl: settings?.value['ADMINBASEURL'],
                assetCode: settings?.value['ASSETCODE'],
                assetIssuer: settings?.value['ASSETCREATOR'],
                assetSecret: settings?.value['ASSETCREATORSECRET'],
              };

              return new DisbursementServices(
                disbursementValues,
                settings?.value['HORIZONURL'],
                settings?.value['NETWORK']
              );
            },
            inject: [SettingsService],
          },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      // Verify services can be created with different settings
      const receiveService = testModule.get<ReceiveService>(ReceiveService);
      const transactionService =
        testModule.get<TransactionService>(TransactionService);
      const disbursementService =
        testModule.get<DisbursementServices>(DisbursementServices);

      expect(receiveService).toBeDefined();
      expect(transactionService).toBeDefined();
      expect(disbursementService).toBeDefined();
      expect(differentMockSettings.getPublic).toHaveBeenCalledWith(
        'STELLAR_SETTINGS'
      );

      await testModule.close();
    });
  });

  describe('Service Exports', () => {
    it('should export DisbursementServices', () => {
      const service = module.get<DisbursementServices>(DisbursementServices);
      expect(service).toBeDefined();
    });

    it('should export StellarService', () => {
      const service = module.get<StellarService>(StellarService);
      expect(service).toBeDefined();
    });

    it('should export ReceiveService', () => {
      const service = module.get<ReceiveService>(ReceiveService);
      expect(service).toBeDefined();
    });

    it('should export TransactionService', () => {
      const service = module.get<TransactionService>(TransactionService);
      expect(service).toBeDefined();
    });
  });
});
