import { Test, TestingModule } from '@nestjs/testing';
import { StellarModule } from './stellar.module';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';

describe('StellarModule', () => {
  let module: TestingModule;

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
    module = await Test.createTestingModule({
      imports: [
        ClientsModule.register([
          {
            name: 'RAHAT_CORE_PROJECT_CLIENT',
            transport: Transport.TCP,
            options: {
              host: 'localhost',
              port: 3000,
            },
          },
        ]),
      ],
      controllers: [StellarController],
      providers: [
        StellarService,
        {
          provide: PrismaService,
          useValue: {
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
          },
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
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