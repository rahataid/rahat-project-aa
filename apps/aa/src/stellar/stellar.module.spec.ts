import { Test, TestingModule } from '@nestjs/testing';
import { StellarModule } from './stellar.module';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import {
  DisbursementService,
  TransactionService,
} from '@rahataid/stellar-sdk-v2';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';

describe('StellarModule', () => {
  let module: TestingModule;

  const mockSettingsService = {
    getPublic: jest.fn().mockResolvedValue({
      value: {
        EMAIL: 'test@example.com',
        PASSWORD: 'password',
        TENANTNAME: 'test_tenant',
      },
    }),
  };

  const mockPrismaService = {};

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
          provide: TransactionService,
          useValue: new TransactionService({} as any),
        },
        {
          provide: DisbursementService,
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            return new DisbursementService({
              email: settings?.value['EMAIL'],
              password: settings?.value['PASSWORD'],
              tenantName: settings?.value['TENANTNAME'],
              baseUrl: settings?.value['BASEURL'],
              assetCode: settings?.value['ASSETCODE'],
              assetIssuer: settings?.value['ASSETCREATOR'],
              assetSecret: settings?.value['ASSETCREATORSECRET'],
              horizonServer: settings?.value['HORIZONURL'],
              network: settings?.value['NETWORK'],
            });
          },
          inject: [SettingsService],
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
