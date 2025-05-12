import { Test } from '@nestjs/testing';
import { BeneficiaryModule } from './beneficiary.module';
import { BeneficiaryService } from './beneficiary.service';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { PrismaService } from '@rumsan/prisma';
import { CvaDisbursementService } from '@rahat-project/cva';
import { StellarService } from '../stellar/stellar.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { StatsModule } from '../stats';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('BeneficiaryModule', () => {
  it('should compile the module', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              COMMUNICATION_URL: 'http://localhost:3000',
              COMMUNICATION_APP_ID: 'test-app',
            }),
          ],
        }),
        BeneficiaryModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        beneficiary: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        rsclient: {
          beneficiary: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        stats: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          upsert: jest.fn(),
          delete: jest.fn(),
        },
      })
      .overrideProvider(BeneficiaryService)
      .useValue({
        create: jest.fn(),
        findAll: jest.fn(),
        findOne: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
      })
      .overrideProvider(BeneficiaryStatService)
      .useValue({
        updateStats: jest.fn(),
      })
      .overrideProvider(CvaDisbursementService)
      .useValue({
        create: jest.fn(),
      })
      .overrideProvider(StellarService)
      .useValue({
        createAccount: jest.fn(),
        faucetAndTrustlineService: jest.fn(),
      })
      .overrideProvider(EventEmitter2)
      .useValue({
        emit: jest.fn(),
      })
      .compile();

    expect(module).toBeDefined();
    
    const beneficiaryController = module.get<BeneficiaryController>(BeneficiaryController);
    expect(beneficiaryController).toBeDefined();
    
    const beneficiaryService = module.get<BeneficiaryService>(BeneficiaryService);
    expect(beneficiaryService).toBeDefined();
    
    const beneficiaryStatService = module.get<BeneficiaryStatService>(BeneficiaryStatService);
    expect(beneficiaryStatService).toBeDefined();
    
    const prismaService = module.get<PrismaService>(PrismaService);
    expect(prismaService).toBeDefined();
    
    const cvaDisbursementService = module.get<CvaDisbursementService>(CvaDisbursementService);
    expect(cvaDisbursementService).toBeDefined();
    
    const stellarService = module.get<StellarService>(StellarService);
    expect(stellarService).toBeDefined();
  });
}); 