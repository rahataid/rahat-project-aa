import { Test, TestingModule } from '@nestjs/testing';
import { StatsService } from './stats.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@rumsan/prisma';
import { ClientProxy } from '@nestjs/microservices';
import { TRIGGGERS_MODULE } from '../constants';
import { of, throwError } from 'rxjs';
import { StatDto } from './dto/stat.dto';

describe('StatsService', () => {
  let service: StatsService;
  let prismaService: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;
  let clientProxy: jest.Mocked<ClientProxy>;

  const mockPrismaService = {
    stats: {
      upsert: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockClientProxy = {
    send: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TRIGGGERS_MODULE,
          useValue: mockClientProxy,
        },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);
    clientProxy = module.get(TRIGGGERS_MODULE);

    // Setup config service defaults
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'COMMUNICATION_URL':
          return 'http://localhost:3000';
        case 'COMMUNICATION_APP_ID':
          return 'test-app';
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('save', () => {
    it('should save a stat and convert name to uppercase', async () => {
      const statDto: StatDto = {
        name: 'gender',
        data: { male: 100, female: 200 },
        group: 'beneficiary',
      };

      const expectedResult = {
        id: 1,
        name: 'GENDER',
        data: { male: 100, female: 200 },
        group: 'beneficiary',
      };

      mockPrismaService.stats.upsert.mockResolvedValue(expectedResult);

      const result = await service.save(statDto);

      expect(prismaService.stats.upsert).toHaveBeenCalledWith({
        where: { name: 'GENDER' },
        update: { ...statDto, name: 'GENDER' },
        create: { ...statDto, name: 'GENDER' },
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('saveMany', () => {
    it('should save multiple stats and delete existing ones by group', async () => {
      const stats: StatDto[] = [
        { name: 'gender', data: { male: 100 }, group: 'beneficiary' },
        { name: 'age', data: { young: 50 }, group: 'beneficiary' },
      ];

      const expectedCreateResult = { count: 2 };

      mockPrismaService.stats.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.stats.createMany.mockResolvedValue(expectedCreateResult);

      const result = await service.saveMany(stats);

      expect(prismaService.stats.deleteMany).toHaveBeenCalledWith({
        where: { group: 'beneficiary' },
      });
      expect(prismaService.stats.createMany).toHaveBeenCalledWith({
        data: [
          { name: 'GENDER', data: { male: 100 }, group: 'beneficiary' },
          { name: 'AGE', data: { young: 50 }, group: 'beneficiary' },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual(expectedCreateResult);
    });

    it('should not delete anything if no group is provided', async () => {
      const stats: StatDto[] = [
        { name: 'gender', data: { male: 100 } },
      ];

      mockPrismaService.stats.createMany.mockResolvedValue({ count: 1 });

      await service.saveMany(stats);

      expect(prismaService.stats.deleteMany).not.toHaveBeenCalled();
      expect(prismaService.stats.createMany).toHaveBeenCalled();
    });
  });

  describe('getByGroup', () => {
    it('should get stats by group with default select', async () => {
      const mockStats = [
        { id: 1, name: 'GENDER', data: { male: 100 }, group: 'beneficiary' },
      ];

      mockPrismaService.stats.findMany.mockResolvedValue(mockStats);

      const result = await service.getByGroup('beneficiary');

      expect(prismaService.stats.findMany).toHaveBeenCalledWith({
        where: { group: 'beneficiary' },
        select: null,
      });
      expect(result).toEqual(mockStats);
    });

    it('should get stats by group with custom select', async () => {
      const mockStats = [{ name: 'GENDER', data: { male: 100 } }];
      const selectFields = { name: true, data: true };

      mockPrismaService.stats.findMany.mockResolvedValue(mockStats);

      const result = await service.getByGroup('beneficiary', selectFields);

      expect(prismaService.stats.findMany).toHaveBeenCalledWith({
        where: { group: 'beneficiary' },
        select: selectFields,
      });
      expect(result).toEqual(mockStats);
    });
  });

  describe('findAll', () => {
    it('should return both beneficiary and triggers stats', async () => {
      const payload = { filter: 'test' };
      const benefStats = [{ name: 'GENDER', data: { male: 100 } }];
      const triggeersStats = [{ name: 'TRIGGERS', data: { count: 5 } }];

      mockPrismaService.stats.findMany.mockResolvedValue(benefStats);
      mockClientProxy.send.mockReturnValue(of(triggeersStats));

      const result = await service.findAll(payload);

      expect(prismaService.stats.findMany).toHaveBeenCalled();
      expect(clientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.ms.trigggers.stats' },
        payload
      );
      expect(result).toEqual({
        benefStats,
        triggeersStats,
      });
    });

    it('should handle microservice errors gracefully', async () => {
      const payload = { filter: 'test' };
      const benefStats = [{ name: 'GENDER', data: { male: 100 } }];

      mockPrismaService.stats.findMany.mockResolvedValue(benefStats);
      mockClientProxy.send.mockReturnValue(throwError(() => new Error('Microservice error')));

      // Mock console.error to avoid cluttering test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.findAll(payload);

      expect(consoleSpy).toHaveBeenCalledWith('Error from microservice:', expect.any(Error));
      expect(result).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('findOne', () => {
    it('should find a stat by name', async () => {
      const payload = { name: 'GENDER' };
      const expectedStat = { id: 1, name: 'GENDER', data: { male: 100 } };

      mockPrismaService.stats.findUnique.mockResolvedValue(expectedStat);

      const result = await service.findOne(payload);

      expect(prismaService.stats.findUnique).toHaveBeenCalledWith({
        where: { name: 'GENDER' },
      });
      expect(result).toEqual(expectedStat);
    });
  });

  describe('remove', () => {
    it('should delete a stat by name', async () => {
      const name = 'GENDER';
      const deletedStat = { id: 1, name: 'GENDER', data: { male: 100 } };

      mockPrismaService.stats.delete.mockResolvedValue(deletedStat);

      const result = await service.remove(name);

      expect(prismaService.stats.delete).toHaveBeenCalledWith({
        where: { name },
      });
      expect(result).toEqual(deletedStat);
    });
  });
});
