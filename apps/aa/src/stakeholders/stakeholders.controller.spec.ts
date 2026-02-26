import { Test, TestingModule } from '@nestjs/testing';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';
import { getGroupByUuidDto } from './dto';

jest.mock('@rumsan/communication', () => ({
  CommunicationService: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
  })),
}));

describe('StakeholdersController', () => {
  let controller: StakeholdersController;

  const mockStakeholdersService = {
    add: jest.fn(),
    bulkAdd: jest.fn(),
    getAll: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    getOne: jest.fn(),
    addGroup: jest.fn(),
    updateGroup: jest.fn(),
    removeGroup: jest.fn(),
    getAllGroups: jest.fn(),
    getAllGroupsByUuids: jest.fn(),
    getGroupDetailsByUuids: jest.fn(),
    getOneGroup: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StakeholdersController],
      providers: [
        {
          provide: StakeholdersService,
          useValue: mockStakeholdersService,
        },
      ],
    }).compile();

    controller = module.get<StakeholdersController>(StakeholdersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== add() ====================
  describe('add', () => {
    it('should delegate to service.add and return result', async () => {
      const payload = {
        name: 'John Doe',
        phone: '+9779841000000',
        email: 'john@test.com',
        designation: 'Engineer',
        organization: 'Test Org',
        district: 'Kathmandu',
        municipality: 'Metro',
        supportArea: ['Health'],
      };
      const expected = { id: 1, uuid: 'uuid-1', ...payload };
      mockStakeholdersService.add.mockResolvedValue(expected);

      const result = await controller.add(payload);

      expect(mockStakeholdersService.add).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });

    it('should propagate errors from service.add', async () => {
      mockStakeholdersService.add.mockRejectedValue(
        new Error('Phone number must be unique')
      );

      await expect(
        controller.add({
          name: 'John',
          phone: '+9779841000000',
          email: '',
          designation: 'Dev',
          organization: 'Org',
          district: 'Dist',
          municipality: 'Muni',
          supportArea: [],
        })
      ).rejects.toThrow('Phone number must be unique');
    });
  });

  // ==================== bulkAdd() ====================
  describe('bulkAdd', () => {
    it('should pass array payload directly to service.bulkAdd', async () => {
      const payload = [
        { Name: 'John', Designation: 'Dev' },
        { Name: 'Jane', Designation: 'Analyst' },
      ];
      const expected = { successCount: 2, message: 'All stakeholders successfully added.' };
      mockStakeholdersService.bulkAdd.mockResolvedValue(expected);

      const result = await controller.bulkAdd(payload);

      expect(mockStakeholdersService.bulkAdd).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });

    it('should normalize object payload to array via Object.values', async () => {
      const payload = {
        0: { Name: 'John' },
        1: { Name: 'Jane' },
      };
      const expected = { successCount: 2, message: 'All stakeholders successfully added.' };
      mockStakeholdersService.bulkAdd.mockResolvedValue(expected);

      const result = await controller.bulkAdd(payload);

      expect(mockStakeholdersService.bulkAdd).toHaveBeenCalledWith([
        { Name: 'John' },
        { Name: 'Jane' },
      ]);
      expect(result).toEqual(expected);
    });

    it('should handle empty array payload', async () => {
      mockStakeholdersService.bulkAdd.mockResolvedValue({ successCount: 0 });

      const result = await controller.bulkAdd([]);

      expect(mockStakeholdersService.bulkAdd).toHaveBeenCalledWith([]);
      expect(result).toEqual({ successCount: 0 });
    });
  });

  // ==================== getAll() ====================
  describe('getAll', () => {
    it('should delegate to service.getAll and return paginated result', async () => {
      const payload = {
        name: 'John',
        designation: '',
        district: '',
        municipality: '',
        organization: '',
        supportArea: '',
        page: 1,
        perPage: 10,
      };
      const expected = {
        data: [{ id: 1, name: 'John Doe' }],
        meta: { total: 1, page: 1, perPage: 10 },
      };
      mockStakeholdersService.getAll.mockResolvedValue(expected);

      const result = await controller.getAll(payload);

      expect(mockStakeholdersService.getAll).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });
  });

  // ==================== remove() ====================
  describe('remove', () => {
    it('should delegate to service.remove and return soft-deleted stakeholder', async () => {
      const payload = { uuid: 'uuid-1' };
      const expected = { id: 1, uuid: 'uuid-1', isDeleted: true };
      mockStakeholdersService.remove.mockResolvedValue(expected);

      const result = await controller.remove(payload);

      expect(mockStakeholdersService.remove).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });
  });

  // ==================== update() ====================
  describe('update', () => {
    it('should delegate to service.update and return updated stakeholder', async () => {
      const payload = { uuid: 'uuid-1', name: 'Updated Name' };
      const expected = { id: 1, uuid: 'uuid-1', name: 'Updated Name' };
      mockStakeholdersService.update.mockResolvedValue(expected);

      const result = await controller.update(payload);

      expect(mockStakeholdersService.update).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });
  });

  // ==================== getOneStakeholder() ====================
  describe('getOneStakeholder', () => {
    it('should delegate to service.getOne and return stakeholder', async () => {
      const payload = { uuid: 'uuid-1' };
      const expected = {
        id: 1,
        uuid: 'uuid-1',
        name: 'John',
        stakeholdersGroups: [],
      };
      mockStakeholdersService.getOne.mockResolvedValue(expected);

      const result = await controller.getOneStakeholder(payload);

      expect(mockStakeholdersService.getOne).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });

    it('should return null when stakeholder not found', async () => {
      mockStakeholdersService.getOne.mockResolvedValue(null);

      const result = await controller.getOneStakeholder({ uuid: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  // ==================== addGroup() ====================
  describe('addGroup', () => {
    it('should delegate to service.addGroup and return created group', async () => {
      const payload = {
        name: 'Group A',
        stakeholders: [{ uuid: 'uuid-1' }],
      };
      const expected = { id: 1, uuid: 'group-uuid', name: 'Group A' };
      mockStakeholdersService.addGroup.mockResolvedValue(expected);

      const result = await controller.addGroup(payload);

      expect(mockStakeholdersService.addGroup).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });
  });

  // ==================== updateGroup() ====================
  describe('updateGroup', () => {
    it('should delegate to service.updateGroup and return updated group', async () => {
      const payload = {
        uuid: 'group-uuid',
        name: 'New Group Name',
        stakeholders: [{ uuid: 'uuid-1' }],
      };
      const expected = { id: 1, uuid: 'group-uuid', name: 'New Group Name' };
      mockStakeholdersService.updateGroup.mockResolvedValue(expected);

      const result = await controller.updateGroup(payload);

      expect(mockStakeholdersService.updateGroup).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });
  });

  // ==================== removeGroup() ====================
  describe('removeGroup', () => {
    it('should return isSuccess:true when group deleted successfully', async () => {
      const payload = { uuid: 'group-uuid' };
      const expected = { isSuccess: true, activities: [] };
      mockStakeholdersService.removeGroup.mockResolvedValue(expected);

      const result = await controller.removeGroup(payload);

      expect(mockStakeholdersService.removeGroup).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });

    it('should return isSuccess:false when group has linked activities', async () => {
      const payload = { uuid: 'group-uuid' };
      const expected = {
        isSuccess: false,
        activities: ['Activity 1', 'Activity 2'],
      };
      mockStakeholdersService.removeGroup.mockResolvedValue(expected);

      const result = await controller.removeGroup(payload);

      expect(result).toEqual(expected);
    });
  });

  // ==================== getAllGroups() ====================
  describe('getAllGroups', () => {
    it('should log, delegate to service.getAllGroups, and return result', async () => {
      const payload = { page: 1, perPage: 10, search: 'test' };
      const expected = {
        data: [{ id: 1, name: 'Group 1' }],
        meta: { total: 1, page: 1, perPage: 10 },
      };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockStakeholdersService.getAllGroups.mockResolvedValue(expected);

      const result = await controller.getAllGroups(payload as any);

      expect(consoleSpy).toHaveBeenCalledWith(
        'getting all stakeholders groups',
        payload
      );
      expect(mockStakeholdersService.getAllGroups).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
      consoleSpy.mockRestore();
    });

    it('should call console.log before calling service', async () => {
      const payload = { page: 1, perPage: 20 };
      const callOrder: string[] = [];
      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => callOrder.push('log'));
      mockStakeholdersService.getAllGroups.mockImplementation(() => {
        callOrder.push('service');
        return Promise.resolve({ data: [], meta: {} });
      });

      await controller.getAllGroups(payload as any);

      expect(callOrder).toEqual(['log', 'service']);
      consoleSpy.mockRestore();
    });
  });

  // ==================== getAllGroupsByUuids() ====================
  describe('getAllGroupsByUuids', () => {
    it('should delegate to service with select fields', async () => {
      const payload: getGroupByUuidDto = {
        uuids: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001',
        ],
        selectField: ['uuid', 'name'],
      };
      const expected = [
        { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Group 1' },
        { uuid: '123e4567-e89b-12d3-a456-426614174001', name: 'Group 2' },
      ];
      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue(expected);

      const result = await controller.getAllGroupsByUuids(payload);

      expect(mockStakeholdersService.getAllGroupsByUuids).toHaveBeenCalledWith(
        payload
      );
      expect(result).toEqual(expected);
    });

    it('should handle payload without select fields', async () => {
      const payload: getGroupByUuidDto = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };
      const expected = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Single Group',
        },
      ];
      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue(expected);

      const result = await controller.getAllGroupsByUuids(payload);

      expect(result).toEqual(expected);
    });

    it('should handle empty UUIDs array', async () => {
      const payload: getGroupByUuidDto = { uuids: [], selectField: undefined };
      mockStakeholdersService.getAllGroupsByUuids.mockResolvedValue([]);

      const result = await controller.getAllGroupsByUuids(payload);

      expect(result).toEqual([]);
    });
  });

  // ==================== getGroupDetailsByUuids() ====================
  describe('getGroupDetailsByUuids', () => {
    it('should delegate to service.getGroupDetailsByUuids', async () => {
      const payload = { uuids: ['uuid-1', 'uuid-2'] };
      const expected = [
        { id: 1, uuid: 'uuid-1', name: 'Group 1', stakeholders: [] },
        { id: 2, uuid: 'uuid-2', name: 'Group 2', stakeholders: [] },
      ];
      mockStakeholdersService.getGroupDetailsByUuids.mockResolvedValue(
        expected
      );

      const result = await controller.getGroupDetailsByUuids(payload);

      expect(
        mockStakeholdersService.getGroupDetailsByUuids
      ).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
    });

    it('should return empty array when no groups found', async () => {
      mockStakeholdersService.getGroupDetailsByUuids.mockResolvedValue([]);

      const result = await controller.getGroupDetailsByUuids({
        uuids: ['nonexistent'],
      });

      expect(result).toEqual([]);
    });
  });

  // ==================== getOneGroup() ====================
  describe('getOneGroup', () => {
    it('should log, delegate to service.getOneGroup, and return result', async () => {
      const payload = { uuid: 'group-uuid' };
      const expected = {
        id: 1,
        uuid: 'group-uuid',
        name: 'Group A',
        stakeholders: [],
      };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockStakeholdersService.getOneGroup.mockResolvedValue(expected);

      const result = await controller.getOneGroup(payload);

      expect(consoleSpy).toHaveBeenCalledWith(
        'getting one stakeholders group',
        payload
      );
      expect(mockStakeholdersService.getOneGroup).toHaveBeenCalledWith(payload);
      expect(result).toEqual(expected);
      consoleSpy.mockRestore();
    });

    it('should return null when group not found', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockStakeholdersService.getOneGroup.mockResolvedValue(null);

      const result = await controller.getOneGroup({ uuid: 'nonexistent' });

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });
});
