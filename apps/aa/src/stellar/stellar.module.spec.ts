import { Test, TestingModule } from '@nestjs/testing';
import { StellarModule } from './stellar.module';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { DisbursementServices, ReceiveService, TransactionService } from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';
import { AppService } from '../app/app.service';

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
        ASSETCREATOR: 'GDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
        ASSETCREATORSECRET: 'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
        HORIZONURL: 'https://horizon-testnet.stellar.org',
        NETWORK: 'TESTNET',
        FAUCETSECRETKEY: 'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXZ',
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

  const mockReceiveService = {
    faucetAndTrustlineService: jest.fn(),
    sendAsset: jest.fn(),
    getAccountBalance: jest.fn(),
  };

  const mockTransactionService = {
    hasTrustline: jest.fn(),
    rahatFaucetService: jest.fn(),
    getTransaction: jest.fn(),
  };

  const mockDisbursementService = {
    createDisbursementProcess: jest.fn(),
    getDisbursement: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
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
          useValue: mockReceiveService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: DisbursementServices,
          useValue: mockDisbursementService,
        },
      ],
    }).compile();
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
});