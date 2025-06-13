import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { SettingsService } from '@rumsan/settings';

jest.mock('./settings.config', () => ({
  setSettings: jest.fn(),
  getSettings: jest.fn().mockReturnValue({ UUID: 'test-uuid' }),
}));

describe('AppService', () => {
  let service: AppService;
  let settingsService: SettingsService;

  const mockSettingsService = {
    create: jest.fn(),
    listAll: jest.fn(),
    getPublic: jest.fn(),
    listPublic: jest.fn(),
    bulkCreate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
    settingsService = module.get<SettingsService>(SettingsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getData', () => {
    it('should return "Hello API" message', () => {
      expect(service.getData()).toEqual({ message: 'Hello API' });
    });
  });

  describe('addSettings', () => {
    const mockSettingsDto = { name: 'test', value: 'value' };

    it('should call settingsService.create with correct parameters', async () => {
      mockSettingsService.create.mockResolvedValue({ success: true });
      
      const result = await service.addSettings(mockSettingsDto);
      
      expect(settingsService.create).toHaveBeenCalledWith(mockSettingsDto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('listSettings', () => {
    it('should return lowercase settings list', async () => {
      const mockSettings = [{ NAME: 'TEST', VALUE: 'VALUE' }];
      mockSettingsService.listAll.mockResolvedValue(mockSettings);
      
      const result = await service.listSettings();
      
      expect(settingsService.listAll).toHaveBeenCalled();
      expect(result).toEqual([{ name: 'TEST', value: 'VALUE' }]);
    });
  });

  describe('getSettings', () => {
    const mockGetSettingsDto = { name: 'test' };

    it('should return lowercase settings', async () => {
      mockSettingsService.getPublic.mockResolvedValue({ NAME: 'TEST', VALUE: 'VALUE' });
      
      const result = await service.getSettings(mockGetSettingsDto);
      
      expect(settingsService.getPublic).toHaveBeenCalledWith('test');
      expect(result).toEqual({ name: 'TEST', value: 'VALUE' });
    });
  });

  describe('resetAll', () => {
    it('should return "ok"', async () => {
      const result = await service.resetAll();
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

    it('should create settings for all provided configurations', async () => {
      mockSettingsService.bulkCreate.mockResolvedValue({ success: true });
      
      const result = await service.setupProjectSettings(mockSetupDto);
      
      expect(settingsService.bulkCreate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'CONTRACTS' }),
        expect.objectContaining({ name: 'BLOCKCHAIN' }),
        expect.objectContaining({ name: 'SUBGRAPH_URL' }),
        expect.objectContaining({ name: 'RAHAT_ADMIN_PRIVATE_KEY' }),
        expect.objectContaining({ name: 'DEPLOYER_PRIVATE_KEY' }),
        expect.objectContaining({ name: 'ADMIN' }),
      ]));
      expect(result).toEqual({ message: 'Project Setup Successfully' });
    });

    it('should only create settings for provided configurations', async () => {
      const partialSetupDto = {
        CONTRACTS: { address: '0x123' },
        BLOCKCHAIN: { network: 'testnet' },
      };

      mockSettingsService.bulkCreate.mockResolvedValue({ success: true });
      
      await service.setupProjectSettings(partialSetupDto);
      
      expect(settingsService.bulkCreate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ name: 'CONTRACTS' }),
        expect.objectContaining({ name: 'BLOCKCHAIN' }),
      ]));
      expect(settingsService.bulkCreate).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({ name: 'SUBGRAPH_URL' }),
          expect.objectContaining({ name: 'RAHAT_ADMIN_PRIVATE_KEY' }),
          expect.objectContaining({ name: 'DEPLOYER_PRIVATE_KEY' }),
          expect.objectContaining({ name: 'ADMIN' }),
        ])
      );
    });
  });

  describe('refreshSettings', () => {
    it('should refresh settings and update config', async () => {
      const mockSettings = [{ name: 'test', value: 'value' }];
      mockSettingsService.listPublic.mockResolvedValue(mockSettings);
      
      await service.refreshSettings();
      
      expect(settingsService.listPublic).toHaveBeenCalled();
      expect(require('./settings.config').setSettings).toHaveBeenCalledWith(mockSettings);
    });
  });

  describe('generateMessagePattern', () => {
    it('should generate correct message pattern', () => {
      const pattern = AppService.generateMessagePattern('test.pattern');
      expect(pattern).toEqual({
        cmd: 'test.pattern',
        uuid: 'test-uuid',
      });
    });
  });
});
