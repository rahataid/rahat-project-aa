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
          provide: ReceiveService,
          useValue: new ReceiveService(),
        },
        {
          provide: TransactionService,
          useValue: new TransactionService(),
        },
        {
          provide: DisbursementServices,
          useFactory: async (settingService: SettingsService) => {
            const settings = await settingService.getPublic('STELLAR_SETTINGS');
            const email = settings?.value['EMAIL'];
            const password = settings?.value['PASSWORD'];
            const tenantName = settings?.value['TENANTNAME'];

            return new DisbursementServices(email, password, tenantName);
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