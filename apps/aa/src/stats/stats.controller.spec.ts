import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  let controller: StatsController;
  let service: jest.Mocked<StatsService>;

  const mockStatsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    saveMany: jest.fn(),
    getByGroup: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
      ],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    service = module.get(StatsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call statsService.findAll with payload', async () => {
      const payload = { filter: 'test', projectId: 'project-123' };
      const expectedResult = {
        benefStats: [{ name: 'GENDER', data: { male: 100, female: 200 } }],
        triggeersStats: [{ name: 'TRIGGERS', data: { count: 5 } }],
      };

      mockStatsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(payload);

      expect(service.findAll).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expectedResult);
    });

    it('should handle service errors', async () => {
      const payload = { filter: 'test' };
      const error = new Error('Service error');

      mockStatsService.findAll.mockRejectedValue(error);

      await expect(controller.findAll(payload)).rejects.toThrow('Service error');
      expect(service.findAll).toHaveBeenCalledWith(payload);
    });
  });

  describe('findOne', () => {
    it('should call statsService.findOne with payload', async () => {
      const payload = { name: 'GENDER' };
      const expectedResult = {
        id: 1,
        name: 'GENDER',
        data: { male: 100, female: 200 },
        group: 'beneficiary',
      };

      mockStatsService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(payload);

      expect(service.findOne).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expectedResult);
    });

    it('should return null when stat not found', async () => {
      const payload = { name: 'NON_EXISTENT' };

      mockStatsService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(payload);

      expect(service.findOne).toHaveBeenCalledWith(payload);
      expect(result).toBeNull();
    });

    it('should handle service errors', async () => {
      const payload = { name: 'GENDER' };
      const error = new Error('Database error');

      mockStatsService.findOne.mockRejectedValue(error);

      await expect(controller.findOne(payload)).rejects.toThrow('Database error');
      expect(service.findOne).toHaveBeenCalledWith(payload);
    });
  });

  describe('Integration Tests', () => {
    it('should properly delegate findAll calls to service', async () => {
      const payload = { projectId: 'test-project' };
      const serviceResponse = {
        benefStats: [{ name: 'TEST_STAT', data: { value: 100 } }],
        triggeersStats: [{ name: 'TRIGGER_STAT', data: { count: 5 } }],
      };

      mockStatsService.findAll.mockResolvedValue(serviceResponse);

      const result = await controller.findAll(payload);

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(service.findAll).toHaveBeenCalledWith(payload);
      expect(result).toBe(serviceResponse); // Should return exactly what service returns
    });

    it('should properly delegate findOne calls to service', async () => {
      const payload = { name: 'SPECIFIC_STAT' };
      const serviceResponse = { id: 1, name: 'SPECIFIC_STAT', data: { value: 42 } };

      mockStatsService.findOne.mockResolvedValue(serviceResponse);

      const result = await controller.findOne(payload);

      expect(service.findOne).toHaveBeenCalledTimes(1);
      expect(service.findOne).toHaveBeenCalledWith(payload);
      expect(result).toBe(serviceResponse); // Should return exactly what service returns
    });
  });

  describe('Smoke Tests', () => {
    it('should handle findAll with empty payload', async () => {
      const payload = {};
      const expectedResult = {
        benefStats: [],
        triggeersStats: [],
      };

      mockStatsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(payload);

      expect(service.findAll).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expectedResult);
    });

    it('should handle findOne with missing name in payload', async () => {
      const payload = {};

      mockStatsService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(payload);

      expect(service.findOne).toHaveBeenCalledWith(payload);
      expect(result).toBeNull();
    });
  });

  describe('Admin/Test Method', () => {
    it('should provide a test method for smoke testing', async () => {
      // This serves as the admin/test method as mentioned in the NestJS testing guidelines
      const testPayload = { name: 'TEST_STAT' };
      const testResult = { name: 'TEST_STAT', data: { test: true }, id: 999 };

      mockStatsService.findOne.mockResolvedValue(testResult);

      const result = await controller.findOne(testPayload);

      expect(result).toEqual(testResult);
      expect(service.findOne).toHaveBeenCalledWith(testPayload);
    });
  });
}); 