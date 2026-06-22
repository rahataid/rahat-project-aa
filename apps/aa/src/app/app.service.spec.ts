import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';

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

  const mockPrismaService = {
    setting: {
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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
    it('should upsert all settings from payload', async () => {
      mockPrismaService.setting.upsert.mockResolvedValue({});

      const payload = {
        settings: [
          {
            name: 'CONTRACTS',
            value: '{"address":"0x123"}',
            dataType: 'OBJECT',
            requiredFields: '{}',
            isReadOnly: false,
            isPrivate: false,
          },
          {
            name: 'CHAIN_SETTINGS',
            value: '{"network":"testnet"}',
            dataType: 'OBJECT',
            requiredFields: '{}',
            isReadOnly: false,
            isPrivate: false,
          },
        ],
      };

      const result = await service.setupProjectSettings(payload);

      expect(mockPrismaService.setting.upsert).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Upserted 2 setting(s) successfully' });
    });

    it('should handle empty settings array', async () => {
      const result = await service.setupProjectSettings({ settings: [] });

      expect(mockPrismaService.setting.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Upserted 0 setting(s) successfully' });
    });

    it('should parse OBJECT values from JSON strings', async () => {
      mockPrismaService.setting.upsert.mockResolvedValue({});

      await service.setupProjectSettings({
        settings: [
          {
            name: 'TEST',
            value: '{"key":"val"}',
            dataType: 'OBJECT',
            requiredFields: '{}',
            isReadOnly: false,
            isPrivate: false,
          },
        ],
      });

      expect(mockPrismaService.setting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            value: { key: 'val' },
          }),
        }),
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
