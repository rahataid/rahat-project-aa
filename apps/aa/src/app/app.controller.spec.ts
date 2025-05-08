import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SettingsService } from '@rumsan/settings';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  const mockAppService = {
    getData: jest.fn().mockReturnValue({ message: 'Hello API' }),
    addSettings: jest.fn(),
    listSettings: jest.fn(),
    getSettings: jest.fn(),
    resetAll: jest.fn(),
    setupProjectSettings: jest.fn(),
  };

  const mockSettingsService = {
    create: jest.fn(),
    listAll: jest.fn(),
    getPublic: jest.fn(),
    listPublic: jest.fn(),
    bulkCreate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getData', () => {
    it('should return "Hello API"', () => {
      expect(controller.getData()).toEqual({ message: 'Hello API' });
      expect(service.getData).toHaveBeenCalled();
    });
  });

  describe('addSettings', () => {
    const mockSettingsDto = { name: 'test', value: 'value' };

    it('should call service.addSettings with correct parameters', async () => {
      mockAppService.addSettings.mockResolvedValue({ success: true });
      
      const result = await controller.addSettings(mockSettingsDto);
      
      expect(service.addSettings).toHaveBeenCalledWith(mockSettingsDto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('listSettings', () => {
    it('should call service.listSettings', async () => {
      const mockSettings = [{ name: 'test', value: 'value' }];
      mockAppService.listSettings.mockResolvedValue(mockSettings);
      
      const result = await controller.listSettings();
      
      expect(service.listSettings).toHaveBeenCalled();
      expect(result).toEqual(mockSettings);
    });
  });

  describe('getSettings', () => {
    const mockGetSettingsDto = { name: 'test' };

    it('should call service.getSettings with correct parameters', async () => {
      mockAppService.getSettings.mockResolvedValue({ value: 'test' });
      
      const result = await controller.getSettings(mockGetSettingsDto);
      
      expect(service.getSettings).toHaveBeenCalledWith(mockGetSettingsDto);
      expect(result).toEqual({ value: 'test' });
    });
  });

  describe('resetAll', () => {
    it('should call service.resetAll', async () => {
      mockAppService.resetAll.mockResolvedValue('ok');
      
      const result = await controller.resetAll();
      
      expect(service.resetAll).toHaveBeenCalled();
      expect(result).toBe('ok');
    });
  });

  describe('setupProjectSettings', () => {
    const mockSetupDto = {
      CONTRACTS: { address: '0x123' },
      BLOCKCHAIN: { network: 'testnet' },
      SUBGRAPH_URL: 'http://test.com',
      RAHAT_ADMIN_PRIVATE_KEY: '0xkey',
      DEPLOYER_PRIVATE_KEY: '0xkey2',
      ADMIN: { address: '0x456' },
    };

    it('should call service.setupProjectSettings with correct parameters', async () => {
      mockAppService.setupProjectSettings.mockResolvedValue({ 
        message: 'Project Setup Successfully' 
      });
      
      const result = await controller.setupProjectSettings(mockSetupDto);
      
      expect(service.setupProjectSettings).toHaveBeenCalledWith(mockSetupDto);
      expect(result).toEqual({ message: 'Project Setup Successfully' });
    });
  });
});
