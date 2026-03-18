import { Test, TestingModule } from '@nestjs/testing';
import { InkindsModule } from './inkinds.module';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';

describe('InkindsModule', () => {
  let module: TestingModule;
  let controller: InkindsController;
  let inkindsService: InkindsService;

  const mockInkindsService = {
    create: jest.fn(),
    getOne: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [InkindsModule],
    })
      .overrideProvider(InkindsService)
      .useValue(mockInkindsService)
      .compile();

    controller = module.get<InkindsController>(InkindsController);
    inkindsService = module.get<InkindsService>(InkindsService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
    expect(controller).toBeDefined();
    expect(inkindsService).toBeDefined();
  });

  it('should have InkindsController', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(InkindsController);
  });

  it('should have InkindsService', () => {
    expect(inkindsService).toBeDefined();
  });
});
