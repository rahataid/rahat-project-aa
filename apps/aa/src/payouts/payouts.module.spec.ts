import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { OfframpService } from './offramp.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';

describe('PayoutsModule', () => {
  let controller: PayoutsController;
  let payoutsService: PayoutsService;
  let offrampService: OfframpService;

  const mockPayoutsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    getOne: jest.fn(),
  };

  const mockOfframpService = {
    getPaymentProvider: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        BullModule.registerQueue({
          name: BQUEUE.STELLAR,
        }),
        BullModule.registerQueue({
          name: BQUEUE.OFFRAMP,
        }),
        BullModule.registerQueue({
          name: BQUEUE.BATCH_TRANSFER,
        }),
      ],

      controllers: [PayoutsController],
      providers: [
        {
          provide: PayoutsService,
          useValue: mockPayoutsService,
        },
        {
          provide: OfframpService,
          useValue: mockOfframpService,
        },
      ],
    }).compile();

    controller = module.get<PayoutsController>(PayoutsController);
    payoutsService = module.get<PayoutsService>(PayoutsService);
    offrampService = module.get<OfframpService>(OfframpService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(payoutsService).toBeDefined();
    expect(offrampService).toBeDefined();
  });

  it('should have PayoutsController', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(PayoutsController);
  });

  it('should have PayoutsService', () => {
    expect(payoutsService).toBeDefined();
  });

  it('should have OfframpService', () => {
    expect(offrampService).toBeDefined();
  });
});
