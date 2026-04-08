import { Test, TestingModule } from '@nestjs/testing';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';
import {
  CreateInkindDto,
  DeleteInkindDto,
  GetInkindDto,
  InkindType,
  ListInkindDto,
  UpdateInkindDto,
} from './dto/inkind.dto';
import { AddInkindStockDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';

describe('InkindsController', () => {
  let controller: InkindsController;
  let inkindsService: InkindsService;

  const mockInkindsService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
    getOne: jest.fn(),
    addInkindStock: jest.fn(),
    getAllStockMovements: jest.fn(),
    removeInkindStock: jest.fn(),
    assignGroupInkind: jest.fn(),
    getByGroup: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InkindsController],
      providers: [
        {
          provide: InkindsService,
          useValue: mockInkindsService,
        },
      ],
    }).compile();

    controller = module.get<InkindsController>(InkindsController);
    inkindsService = module.get<InkindsService>(InkindsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(inkindsService).toBeDefined();
  });

  describe('create', () => {
    it('should create an inkind successfully', async () => {
      const createInkindDto: CreateInkindDto = {
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        description: '25kg rice bag',
        quantity: 10,
      };

      const expectedResult = {
        uuid: 'inkind-uuid-123',
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        description: '25kg rice bag',
        availableStock: 10,
      };

      mockInkindsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.create).toHaveBeenCalledWith(createInkindDto);
    });

    it('should handle service errors in create', async () => {
      const createInkindDto: CreateInkindDto = {
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
      };

      const error = new Error('Inkind already exists');
      mockInkindsService.create.mockRejectedValue(error);

      await expect(controller.create(createInkindDto)).rejects.toThrow(
        'Inkind already exists'
      );
    });
  });

  describe('update', () => {
    it('should update an inkind successfully', async () => {
      const updateInkindDto: UpdateInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Updated Rice Bag',
        type: InkindType.PRE_DEFINED,
      };

      const expectedResult = {
        uuid: updateInkindDto.uuid,
        name: 'Updated Rice Bag',
        type: InkindType.PRE_DEFINED,
      };

      mockInkindsService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(updateInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.update).toHaveBeenCalledWith(updateInkindDto);
    });

    it('should handle update errors', async () => {
      const updateInkindDto: UpdateInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        name: 'Updated Rice Bag',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.update.mockRejectedValue(error);

      await expect(controller.update(updateInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete an inkind successfully', async () => {
      const deleteInkindDto: DeleteInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const expectedResult = {
        success: true,
        message: 'Inkind deleted successfully',
      };

      mockInkindsService.delete.mockResolvedValue(expectedResult);

      const result = await controller.delete(deleteInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.delete).toHaveBeenCalledWith(
        deleteInkindDto.uuid
      );
    });

    it('should handle delete errors', async () => {
      const deleteInkindDto: DeleteInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.delete.mockRejectedValue(error);

      await expect(controller.delete(deleteInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });

  describe('get', () => {
    it('should return paginated inkinds', async () => {
      const listInkindDto: ListInkindDto = {
        page: 1,
        perPage: 10,
        type: InkindType.WALK_IN,
        name: 'rice',
        sort: 'name',
        order: 'asc',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'inkind-uuid-123',
            name: 'Rice Bag',
            type: InkindType.WALK_IN,
            availableStock: 10,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 10,
        },
      };

      mockInkindsService.get.mockResolvedValue(expectedResult);

      const result = await controller.get(listInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.get).toHaveBeenCalledWith(listInkindDto);
    });

    it('should handle empty payload in get', async () => {
      const listInkindDto: ListInkindDto = {};

      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, perPage: 10 },
      };

      mockInkindsService.get.mockResolvedValue(expectedResult);

      const result = await controller.get(listInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.get).toHaveBeenCalledWith(listInkindDto);
    });
  });

  describe('getOne', () => {
    it('should return a single inkind by uuid', async () => {
      const getInkindDto: GetInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const expectedResult = {
        uuid: getInkindDto.uuid,
        name: 'Rice Bag',
        type: InkindType.WALK_IN,
        availableStock: 10,
      };

      mockInkindsService.getOne.mockResolvedValue(expectedResult);

      const result = await controller.getOne(getInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.getOne).toHaveBeenCalledWith(getInkindDto.uuid);
    });

    it('should handle non-existent inkind in getOne', async () => {
      const getInkindDto: GetInkindDto = {
        uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      };

      const error = new Error('Inkind not found');
      mockInkindsService.getOne.mockRejectedValue(error);

      await expect(controller.getOne(getInkindDto)).rejects.toThrow(
        'Inkind not found'
      );
    });
  });

  describe('addInkindStock', () => {
    it('should add inkind stock successfully', async () => {
      const addInkindStockDto: AddInkindStockDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        quantity: 50,
      };

      const expectedResult = {
        uuid: 'stock-movement-uuid-123',
        inkindId: addInkindStockDto.inkindId,
        quantity: addInkindStockDto.quantity,
        type: 'ADD',
        createdAt: new Date(),
      };

      mockInkindsService.addInkindStock.mockResolvedValue(expectedResult);

      const result = await controller.addInkindStock(addInkindStockDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.addInkindStock).toHaveBeenCalledWith(
        addInkindStockDto
      );
    });

    it('should handle errors when adding inkind stock', async () => {
      const addInkindStockDto: AddInkindStockDto = {
        inkindId: 'invalid-uuid',
        quantity: 50,
      };

      const error = new Error('Inkind not found');
      mockInkindsService.addInkindStock.mockRejectedValue(error);

      await expect(
        controller.addInkindStock(addInkindStockDto)
      ).rejects.toThrow('Inkind not found');
    });

    it('should add stock with optional groupInkindId and redemptionId', async () => {
      const addInkindStockDto: AddInkindStockDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        quantity: 25,
        groupInkindId: 'group-inkind-uuid-123',
        redemptionId: 'redemption-uuid-123',
      };

      const expectedResult = {
        uuid: 'stock-movement-uuid-456',
        inkindId: addInkindStockDto.inkindId,
        quantity: addInkindStockDto.quantity,
        type: 'ADD',
        groupInkindId: addInkindStockDto.groupInkindId,
        redemptionId: addInkindStockDto.redemptionId,
        createdAt: new Date(),
      };

      mockInkindsService.addInkindStock.mockResolvedValue(expectedResult);

      const result = await controller.addInkindStock(addInkindStockDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.addInkindStock).toHaveBeenCalledWith(
        addInkindStockDto
      );
    });
  });

  describe('getAllStockMovements', () => {
    it('should return all stock movements successfully', async () => {
      const expectedResult = [
        {
          uuid: 'movement-uuid-1',
          inkindId: 'inkind-uuid-1',
          quantity: 50,
          type: 'ADD',
          inkind: { name: 'Rice Bag', type: 'WALK_IN' },
          groupInkind: null,
          redemption: null,
          createdAt: new Date(),
        },
        {
          uuid: 'movement-uuid-2',
          inkindId: 'inkind-uuid-2',
          quantity: 25,
          type: 'REMOVE',
          inkind: { name: 'Oil Bottle', type: 'PRE_DEFINED' },
          groupInkind: null,
          redemption: null,
          createdAt: new Date(),
        },
      ];

      mockInkindsService.getAllStockMovements.mockResolvedValue(expectedResult);

      const result = await controller.getAllStockMovements({ page: 1, perPage: 10 });

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.getAllStockMovements).toHaveBeenCalled();
    });

    it('should handle errors when getting all stock movements', async () => {
      const error = new Error('Database connection failed');
      mockInkindsService.getAllStockMovements.mockRejectedValue(error);

      await expect(controller.getAllStockMovements({ page: 1, perPage: 10 })).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should return empty array when no stock movements exist', async () => {
      mockInkindsService.getAllStockMovements.mockResolvedValue([]);

      const result = await controller.getAllStockMovements({ page: 1, perPage: 10 });

      expect(result).toEqual([]);
      expect(mockInkindsService.getAllStockMovements).toHaveBeenCalled();
    });
  });

  describe('removeInkindStock', () => {
    it('should remove inkind stock successfully', async () => {
      const removeInkindStockDto: RemoveInkindStockDto = {
        inkindUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        quantity: 10,
      };

      const expectedResult = {
        uuid: 'stock-movement-uuid-789',
        inkindId: removeInkindStockDto.inkindUuid,
        quantity: removeInkindStockDto.quantity,
        type: 'REMOVE',
        createdAt: new Date(),
      };

      mockInkindsService.removeInkindStock.mockResolvedValue(expectedResult);

      const result = await controller.removeInkindStock(removeInkindStockDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.removeInkindStock).toHaveBeenCalledWith(
        removeInkindStockDto
      );
    });

    it('should handle errors when removing inkind stock', async () => {
      const removeInkindStockDto: RemoveInkindStockDto = {
        inkindUuid: 'invalid-uuid',
        quantity: 10,
      };

      const error = new Error('Inkind not found');
      mockInkindsService.removeInkindStock.mockRejectedValue(error);

      await expect(
        controller.removeInkindStock(removeInkindStockDto)
      ).rejects.toThrow('Inkind not found');
    });
  });

  describe('assignGroupInkind', () => {
    const mockUser = { id: 1, userId: 1, uuid: 'user-uuid', name: 'Admin', email: 'a@b.com', phone: null, wallet: '0xabc' };

    it('should assign group inkind successfully', async () => {
      const assignGroupInkindDto: AssignGroupInkindDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        groupId: 'group-uuid-123',
        quantity: 2,
        user: mockUser,
      };

      const expectedResult = {
        success: true,
        message: 'Group inkind assigned successfully',
      };

      mockInkindsService.assignGroupInkind.mockResolvedValue(expectedResult);

      const result = await controller.assignGroupInkind(assignGroupInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.assignGroupInkind).toHaveBeenCalledWith(
        assignGroupInkindDto
      );
    });

    it('should assign group inkind with default quantity of 1', async () => {
      const assignGroupInkindDto: AssignGroupInkindDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        groupId: 'group-uuid-123',
        user: mockUser,
      };

      const expectedResult = {
        success: true,
        message: 'Group inkind assigned successfully',
      };

      mockInkindsService.assignGroupInkind.mockResolvedValue(expectedResult);

      const result = await controller.assignGroupInkind(assignGroupInkindDto);

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.assignGroupInkind).toHaveBeenCalledWith(
        assignGroupInkindDto
      );
    });

    it('should handle errors when assigning group inkind', async () => {
      const assignGroupInkindDto: AssignGroupInkindDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        groupId: 'group-uuid-123',
        quantity: 100,
        user: mockUser,
      };

      const error = new Error('Not enough stock available');
      mockInkindsService.assignGroupInkind.mockRejectedValue(error);

      await expect(
        controller.assignGroupInkind(assignGroupInkindDto)
      ).rejects.toThrow('Not enough stock available');
    });

    it('should handle duplicate assignment error', async () => {
      const assignGroupInkindDto: AssignGroupInkindDto = {
        inkindId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        groupId: 'group-uuid-123',
        quantity: 1,
        user: mockUser,
      };

      const error = new Error('Inkind is already assigned to this group');
      mockInkindsService.assignGroupInkind.mockRejectedValue(error);

      await expect(
        controller.assignGroupInkind(assignGroupInkindDto)
      ).rejects.toThrow('Inkind is already assigned to this group');
    });
  });

  describe('getByGroup', () => {
    it('should return group inkinds successfully', async () => {
      const expectedResult = [
        {
          uuid: 'group-inkind-uuid-1',
          groupId: 'group-uuid-1',
          inkindId: 'inkind-uuid-1',
          quantityAllocated: 2,
          inkind: {
            uuid: 'inkind-uuid-1',
            name: 'Rice Bag',
            type: 'WALK_IN',
            description: '25kg rice bag',
          },
          group: {
            uuid: 'group-uuid-1',
            name: 'Group A',
          },
          createdAt: new Date(),
        },
        {
          uuid: 'group-inkind-uuid-2',
          groupId: 'group-uuid-2',
          inkindId: 'inkind-uuid-2',
          quantityAllocated: 1,
          inkind: {
            uuid: 'inkind-uuid-2',
            name: 'Oil Bottle',
            type: 'PRE_DEFINED',
            description: '1L oil bottle',
          },
          group: {
            uuid: 'group-uuid-2',
            name: 'Group B',
          },
          createdAt: new Date(),
        },
      ];

      mockInkindsService.getByGroup.mockResolvedValue(expectedResult);

      const result = await controller.getByGroup();

      expect(result).toEqual(expectedResult);
      expect(mockInkindsService.getByGroup).toHaveBeenCalled();
    });

    it('should return empty array when no group assignments exist', async () => {
      mockInkindsService.getByGroup.mockResolvedValue([]);

      const result = await controller.getByGroup();

      expect(result).toEqual([]);
      expect(mockInkindsService.getByGroup).toHaveBeenCalled();
    });

    it('should handle errors when getting group inkinds', async () => {
      const error = new Error('Database connection failed');
      mockInkindsService.getByGroup.mockRejectedValue(error);

      await expect(controller.getByGroup()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });
});
