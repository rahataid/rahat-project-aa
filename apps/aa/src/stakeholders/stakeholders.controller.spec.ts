import { Test, TestingModule } from '@nestjs/testing';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';
import { getGroupByUuidDto } from './dto';
import { ConfigService } from '@nestjs/config';

jest.mock('@rumsan/communication', () => {
  return {
    CommunicationService: jest.fn().mockImplementation(() => ({
      sendMessage: jest.fn(),
    })),
  };
});

describe('StakeholdersController', () => {
  let controller: StakeholdersController;
  let service: StakeholdersService;

  const mockStakeholdersService = {
    getAllGroupsByUuids: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'COMMUNICATION_URL') return 'http://mock-url';
      if (key === 'COMMUNICATION_APP_ID') return 'mock-app-id';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StakeholdersController],
      providers: [
        {
          provide: StakeholdersService,
          useValue: mockStakeholdersService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<StakeholdersController>(StakeholdersController);
    service = module.get<StakeholdersService>(StakeholdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllGroupsByUuids', () => {
    it('should get groups by UUIDs with select fields', async () => {
      const payload: getGroupByUuidDto = {
        uuids: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001',
        ],
        selectField: ['uuid', 'name'],
      };
      const expectedResult = [
        { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Group 1' },
        { uuid: '123e4567-e89b-12d3-a456-426614174001', name: 'Group 2' },
      ];

      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getAllGroupsByUuids(payload);

      expect(result).toEqual(expectedResult);
      expect(mockStakeholdersService.getAllGroupsByUuids).toHaveBeenCalledWith(
        payload
      );
    });

    it('should handle getAllGroupsByUuids with minimal payload', async () => {
      const payload: getGroupByUuidDto = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };
      const expectedResult = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Single Group',
          description: 'Single Description',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getAllGroupsByUuids(payload);

      expect(result).toEqual(expectedResult);
      expect(mockStakeholdersService.getAllGroupsByUuids).toHaveBeenCalledWith(
        payload
      );
    });

    it('should handle empty UUIDs array', async () => {
      const payload: getGroupByUuidDto = {
        uuids: [],
        selectField: undefined,
      };
      const expectedResult = [];

      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue(
        expectedResult
      );

      const result = await controller.getAllGroupsByUuids(payload);

      expect(result).toEqual(expectedResult);
      expect(mockStakeholdersService.getAllGroupsByUuids).toHaveBeenCalledWith(
        payload
      );
    });
  });
});
