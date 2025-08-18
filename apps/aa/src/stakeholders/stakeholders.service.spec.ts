import { Test, TestingModule } from '@nestjs/testing';
import { StakeholdersService } from './stakeholders.service';
import { PrismaService } from '@rumsan/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { CommunicationService } from '@rumsan/communication';
import { ConfigService } from '@nestjs/config';
import { StatsService } from '../stats';
import { EventEmitter2 } from '@nestjs/event-emitter';

jest.mock('@rumsan/communication', () => {
  return {
    CommunicationService: jest.fn().mockImplementation(() => ({
      sendMessage: jest.fn(),
    })),
  };
});

describe('StakeholderService', () => {
  let service: StakeholdersService;

  const mockPrismaService = {
    stakeholdersGroups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'COMMUNICATION_URL') return 'http://mock-url';
      if (key === 'COMMUNICATION_APP_ID') return 'mock-app-id';
      return null;
    }),
  };

  const mockStatsService = { someMethod: jest.fn() };

  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakeholdersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<StakeholdersService>(StakeholdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllGroupsByUuids', () => {
    it('should fetch groups by UUIDs without select fields', async () => {
      const payload = {
        uuids: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001',
        ],
        selectField: undefined,
      };
      const mockGroups = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Group 1',
          description: 'Description 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          uuid: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Group 2',
          description: 'Description 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: {
            in: [
              '123e4567-e89b-12d3-a456-426614174000',
              '123e4567-e89b-12d3-a456-426614174001',
            ],
          },
        },
      });
      expect(result).toEqual(mockGroups);
    });

    it('should fetch groups by UUIDs with select fields', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: ['uuid', 'name'],
      };
      const mockSelectedGroups = [
        { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Group 1' },
      ];

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockSelectedGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: {
            in: ['123e4567-e89b-12d3-a456-426614174000'],
          },
        },
        select: {
          uuid: true,
          name: true,
        },
      });
      expect(result).toEqual(mockSelectedGroups);
    });

    it('should return empty array when no groups found', async () => {
      const payload = {
        uuids: ['non-existent-uuid'],
        selectField: undefined,
      };

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids(payload);

      expect(result).toEqual([]);
    });

    it('should handle empty UUIDs array', async () => {
      const payload = {
        uuids: [],
        selectField: undefined,
      };

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: {
            in: [],
          },
        },
      });
      expect(result).toEqual([]);
    });

    it('should handle empty select fields array', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: [],
      };
      const mockGroup = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Group',
        },
      ];

      mockPrismaService.stakeholdersGroups.findMany.mockResolvedValue(
        mockGroup
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(
        mockPrismaService.stakeholdersGroups.findMany
      ).toHaveBeenCalledWith({
        where: {
          uuid: {
            in: ['123e4567-e89b-12d3-a456-426614174000'],
          },
        },
      });
      expect(result).toEqual(mockGroup);
    });

    it('should throw RpcException when database error occurs', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };

      mockPrismaService.stakeholdersGroups.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(service.getAllGroupsByUuids(payload)).rejects.toThrow(
        new RpcException(
          'Error while fetching stakeholders groups by uuids. Database connection failed'
        )
      );
    });

    it('should throw RpcException with generic message when error has no message', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };

      mockPrismaService.stakeholdersGroups.findMany.mockRejectedValue(
        new Error()
      );

      await expect(service.getAllGroupsByUuids(payload)).rejects.toThrow(
        new RpcException('Error while fetching stakeholders groups by uuids. ')
      );
    });
  });
});
