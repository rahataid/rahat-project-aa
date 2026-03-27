import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { InkindsService } from './inkinds.service';
import { InkindType, ListInkindDto } from './dto/inkind.dto';
import { InkindStockMovementType } from '@prisma/client';
import { AddInkindStockDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';

// Mock the entire @rumsan/prisma module
jest.mock('@rumsan/prisma', () => {
  const mockPaginateFn = jest.fn();
  return {
    PrismaService: class PrismaService {},
    paginator: jest.fn().mockReturnValue(mockPaginateFn),
    __mockPaginateFn: mockPaginateFn,
  };
});

describe('InkindsService', () => {
  let service: InkindsService;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockPaginateFn = require('@rumsan/prisma')
    .__mockPaginateFn as jest.Mock;

  const mockTx = {
    inkind: {
      create: jest.fn(),
    },
    inkindStockMovement: {
      create: jest.fn(),
    },
    groupInkind: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockPrismaService = {
    inkind: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    inkindStockMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    groupInkind: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    beneficiaryToGroup: {
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockTx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InkindsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<InkindsService>(InkindsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockPaginateFn.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      description: 'Test description',
    };

    const mockCreatedInkind = {
      id: 1,
      uuid: 'test-uuid',
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      description: 'Test description',
      image: null,
      availableStock: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should create inkind successfully without initial stock', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockResolvedValue(mockCreatedInkind);

      const result = await service.create(createDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { name: createDto.name, deletedAt: null },
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockTx.inkind.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          type: createDto.type,
          description: createDto.description,
          image: undefined,
        },
      });
      expect(mockTx.inkindStockMovement.create).not.toHaveBeenCalled();
      expect(result.name).toBe(createDto.name);
    });

    it('should create inkind with initial stock movement', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockResolvedValue(mockCreatedInkind);

      const result = await service.create({ ...createDto, quantity: 50 });

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { name: createDto.name, deletedAt: null },
      });
      expect(mockTx.inkind.create).toHaveBeenCalled();
      expect(mockTx.inkindStockMovement.create).toHaveBeenCalledWith({
        data: {
          inkindId: 'test-uuid',
          quantity: 50,
          type: 'ADD',
        },
      });
      expect(result.uuid).toBe('test-uuid');
      expect(result.availableStock).toBe(50);
    });

    it('should throw RpcException when inkind name already exists', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockCreatedInkind);

      await expect(service.create(createDto)).rejects.toThrow(RpcException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw RpcException on failure', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockRejectedValue(new Error('duplicate key'));

      await expect(service.create(createDto)).rejects.toThrow(RpcException);
    });
  });

  describe('getOne', () => {
    const uuid = 'test-uuid';
    const mockInkind = {
      id: 1,
      uuid,
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      description: 'Test description',
      image: null,
      availableStock: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should return inkind successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);

      const result = await service.getOne(uuid);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid, deletedAt: null },
      });
      expect(result.uuid).toBe(uuid);
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.getOne(uuid)).rejects.toThrow(RpcException);
    });
  });

  describe('update', () => {
    const updateDto = {
      uuid: 'test-uuid',
      name: 'Updated Inkind',
      type: InkindType.PRE_DEFINED,
    };

    const mockExistingInkind = {
      id: 1,
      uuid: 'test-uuid',
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      description: 'Test description',
      image: null,
      availableStock: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const mockUpdatedInkind = {
      ...mockExistingInkind,
      name: updateDto.name,
      type: updateDto.type,
    };

    it('should update inkind successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockExistingInkind);
      mockPrismaService.inkind.update.mockResolvedValue(mockUpdatedInkind);

      const result = await service.update(updateDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid: updateDto.uuid, deletedAt: null },
      });
      expect(mockPrismaService.inkind.update).toHaveBeenCalledWith({
        where: { uuid: updateDto.uuid },
        data: {
          name: updateDto.name,
          type: updateDto.type,
        },
      });
      expect(result.name).toBe(updateDto.name);
      expect(result.type).toBe(updateDto.type);
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.update(updateDto)).rejects.toThrow(RpcException);
    });
  });

  describe('delete', () => {
    const uuid = 'test-uuid';
    const mockInkind = {
      id: 1,
      uuid,
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      description: 'Test description',
      image: null,
      availableStock: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should delete inkind successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);
      mockPrismaService.inkind.update.mockResolvedValue({
        ...mockInkind,
        deletedAt: new Date(),
      });

      const result = await service.delete(uuid);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid, deletedAt: null },
      });
      expect(mockPrismaService.inkind.update).toHaveBeenCalledWith({
        where: { uuid },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result.success).toBe(true);
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.delete(uuid)).rejects.toThrow(RpcException);
      expect(mockPrismaService.inkind.update).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    const listDto: ListInkindDto = {
      page: 1,
      perPage: 10,
      type: InkindType.WALK_IN,
      name: 'test',
      sort: 'name',
      order: 'asc',
    };

    const mockPaginatedResult = {
      data: [
        {
          id: 1,
          uuid: 'uuid-1',
          name: 'Inkind 1',
          type: InkindType.WALK_IN,
          description: 'Description 1',
          image: null,
          availableStock: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
      meta: {
        total: 1,
        page: 1,
        perPage: 10,
        totalPages: 1,
      },
    };

    it('should return paginated inkinds successfully', async () => {
      mockPaginateFn.mockResolvedValue(mockPaginatedResult);

      const result = await service.get(listDto);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkind,
        {
          where: {
            deletedAt: null,
            type: InkindType.WALK_IN,
            name: { contains: 'test', mode: 'insensitive' },
          },
          orderBy: { name: 'asc' },
        },
        { page: 1, perPage: 10 }
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should use default sort and order values', async () => {
      mockPaginateFn.mockResolvedValue(mockPaginatedResult);
      const minimalDto = { page: 1, perPage: 5 };

      await service.get(minimalDto);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkind,
        {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        { page: 1, perPage: 5 }
      );
    });

    it('should throw RpcException when paginate fails', async () => {
      mockPaginateFn.mockRejectedValue(new RpcException('Database error'));

      await expect(service.get(listDto)).rejects.toThrow(RpcException);
      expect(mockPaginateFn).toHaveBeenCalled();
    });
  });

  describe('addInkindStock', () => {
    const mockInkind = {
      uuid: 'test-uuid',
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      availableStock: 100,
    };

    const mockStockMovement = {
      uuid: 'stock-movement-uuid',
      inkindId: 'test-uuid',
      quantity: 50,
      type: InkindStockMovementType.ADD,
      groupInkindId: null,
      redemptionId: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);
      mockPrismaService.inkindStockMovement.create.mockResolvedValue(
        mockStockMovement
      );
    });

    it('should add inkind stock successfully', async () => {
      const addStockDto: AddInkindStockDto = {
        inkindId: 'test-uuid',
        quantity: 50,
      };

      const result = await service.addInkindStock(addStockDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'test-uuid', deletedAt: null },
      });
      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith(
        {
          data: {
            inkindId: 'test-uuid',
            quantity: 50,
            type: InkindStockMovementType.ADD,
            groupInkindId: undefined,
            redemptionId: undefined,
          },
        }
      );
      expect(result).toEqual(mockStockMovement);
    });

    it('should add stock with groupInkindId and redemptionId', async () => {
      const addStockDto: AddInkindStockDto = {
        inkindId: 'test-uuid',
        quantity: 25,
        groupInkindId: 'group-inkind-uuid',
        redemptionId: 'redemption-uuid',
      };

      await service.addInkindStock(addStockDto);

      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith(
        {
          data: {
            inkindId: 'test-uuid',
            quantity: 25,
            type: InkindStockMovementType.ADD,
            groupInkindId: 'group-inkind-uuid',
            redemptionId: 'redemption-uuid',
          },
        }
      );
    });

    it('should throw RpcException for invalid inkindId', async () => {
      const addStockDto: AddInkindStockDto = {
        inkindId: '',
        quantity: 50,
      };

      await expect(service.addInkindStock(addStockDto)).rejects.toThrow(
        'Missing or invalid required fields'
      );
    });

    it('should throw RpcException for invalid quantity', async () => {
      const addStockDto: AddInkindStockDto = {
        inkindId: 'test-uuid',
        quantity: 0,
      };

      await expect(service.addInkindStock(addStockDto)).rejects.toThrow(
        'Missing or invalid required fields'
      );
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      const addStockDto: AddInkindStockDto = {
        inkindId: 'invalid-uuid',
        quantity: 50,
      };

      await expect(service.addInkindStock(addStockDto)).rejects.toThrow(
        'Inkind with UUID invalid-uuid not found'
      );
    });
  });

  describe('getAllStockMovements', () => {
    const mockStockMovements = [
      {
        uuid: 'movement-1',
        inkindId: 'inkind-1',
        quantity: 100,
        type: InkindStockMovementType.ADD,
        inkind: { name: 'Rice', type: InkindType.WALK_IN },
        groupInkind: null,
        redemption: null,
        createdAt: new Date(),
      },
      {
        uuid: 'movement-2',
        inkindId: 'inkind-2',
        quantity: 50,
        type: InkindStockMovementType.REMOVE,
        inkind: { name: 'Oil', type: InkindType.PRE_DEFINED },
        groupInkind: null,
        redemption: null,
        createdAt: new Date(),
      },
    ];

    it('should return all stock movements successfully', async () => {
      mockPrismaService.inkindStockMovement.findMany.mockResolvedValue(
        mockStockMovements
      );

      const result = await service.getAllStockMovements();

      expect(
        mockPrismaService.inkindStockMovement.findMany
      ).toHaveBeenCalledWith({
        include: {
          inkind: true,
          groupInkind: true,
          redemption: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockStockMovements);
    });

    it('should return empty array when no movements exist', async () => {
      mockPrismaService.inkindStockMovement.findMany.mockResolvedValue([]);

      const result = await service.getAllStockMovements();

      expect(result).toEqual([]);
    });

    it('should throw RpcException when database error occurs', async () => {
      mockPrismaService.inkindStockMovement.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.getAllStockMovements()).rejects.toThrow(
        RpcException
      );
    });
  });

  describe('removeInkindStock', () => {
    const mockInkind = {
      uuid: 'test-uuid',
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      availableStock: 100,
    };

    const mockStockMovement = {
      uuid: 'stock-movement-uuid',
      inkindId: 'test-uuid',
      quantity: 25,
      type: InkindStockMovementType.REMOVE,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);
      mockPrismaService.inkindStockMovement.create.mockResolvedValue(
        mockStockMovement
      );
    });

    it('should remove inkind stock successfully', async () => {
      const removeStockDto: RemoveInkindStockDto = {
        inkindUuid: 'test-uuid',
        quantity: 25,
      };

      const result = await service.removeInkindStock(removeStockDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'test-uuid', deletedAt: null },
      });
      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith(
        {
          data: {
            inkindId: 'test-uuid',
            quantity: 25,
            type: InkindStockMovementType.REMOVE,
          },
        }
      );
      expect(result).toEqual(mockStockMovement);
    });

    it('should throw RpcException for missing inkindUuid', async () => {
      const removeStockDto: RemoveInkindStockDto = {
        inkindUuid: '',
        quantity: 25,
      };

      await expect(service.removeInkindStock(removeStockDto)).rejects.toThrow(
        'Missing inkindUuid field'
      );
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      const removeStockDto: RemoveInkindStockDto = {
        inkindUuid: 'invalid-uuid',
        quantity: 25,
      };

      await expect(service.removeInkindStock(removeStockDto)).rejects.toThrow(
        'Inkind with UUID invalid-uuid not found'
      );
    });
  });

  describe('assignGroupInkind', () => {
    const mockUser = {
      id: 1,
      userId: 1,
      uuid: 'user-uuid',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      wallet: '0x123',
    };

    const mockInkind = {
      uuid: 'inkind-uuid',
      name: 'Test Inkind',
      type: InkindType.WALK_IN,
      availableStock: 100,
    };

    const mockGroupInkind = {
      uuid: 'group-inkind-uuid',
      groupId: 'group-uuid',
      inkindId: 'inkind-uuid',
      quantityAllocated: 2,
    };

    beforeEach(() => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(5);
      mockTx.groupInkind.create.mockResolvedValue(mockGroupInkind);
      mockTx.groupInkind.findFirst.mockResolvedValue(null);
    });

    it('should assign group inkind successfully', async () => {
      const assignDto: AssignGroupInkindDto = {
        inkindId: 'inkind-uuid',
        groupId: 'group-uuid',
        quantity: 2,
        user: mockUser,
      };

      const result = await service.assignGroupInkind(assignDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({
        where: { uuid: 'inkind-uuid', deletedAt: null },
      });
      expect(mockPrismaService.groupInkind.findFirst).toHaveBeenCalledWith({
        where: { groupId: 'group-uuid', inkindId: 'inkind-uuid' },
      });
      expect(mockPrismaService.beneficiaryToGroup.count).toHaveBeenCalledWith({
        where: { groupId: 'group-uuid' },
      });
      expect(mockTx.groupInkind.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-uuid',
          inkindId: 'inkind-uuid',
          quantityAllocated: 2,
        },
      });
      expect(mockTx.inkindStockMovement.create).toHaveBeenCalledWith({
        data: {
          inkindId: 'inkind-uuid',
          quantity: 10, // 2 * 5 beneficiaries
          type: InkindStockMovementType.LOCK,
          groupInkindId: 'group-inkind-uuid',
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'Group inkind assigned successfully',
      });
    });

    it('should use default quantity of 1 when not specified', async () => {
      const assignDto: AssignGroupInkindDto = {
        inkindId: 'inkind-uuid',
        groupId: 'group-uuid',
        user: mockUser,
      };

      await service.assignGroupInkind(assignDto);

      expect(mockTx.groupInkind.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-uuid',
          inkindId: 'inkind-uuid',
          quantityAllocated: 1,
        },
      });
    });

    it('should throw RpcException for missing required fields', async () => {
      const assignDto: AssignGroupInkindDto = {
        inkindId: '',
        groupId: 'group-uuid',
        user: mockUser,
      };

      await expect(service.assignGroupInkind(assignDto)).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('should throw RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      const assignDto: AssignGroupInkindDto = {
        inkindId: 'invalid-uuid',
        groupId: 'group-uuid',
        user: mockUser,
      };

      await expect(service.assignGroupInkind(assignDto)).rejects.toThrow(
        'Inkind with UUID invalid-uuid not found'
      );
    });

    it('should throw RpcException when group inkind already exists', async () => {
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(
        mockGroupInkind
      );

      const assignDto: AssignGroupInkindDto = {
        inkindId: 'inkind-uuid',
        groupId: 'group-uuid',
        user: mockUser,
      };

      await expect(service.assignGroupInkind(assignDto)).rejects.toThrow(
        'Inkind is already assigned to this group.'
      );
    });

    it('should throw RpcException when insufficient stock', async () => {
      const lowStockInkind = { ...mockInkind, availableStock: 5 };
      mockPrismaService.inkind.findFirst.mockResolvedValue(lowStockInkind);

      const assignDto: AssignGroupInkindDto = {
        inkindId: 'inkind-uuid',
        groupId: 'group-uuid',
        quantity: 2,
        user: mockUser,
      };

      await expect(service.assignGroupInkind(assignDto)).rejects.toThrow(
        'Not enough stock available. Requested: 10, Available: 5'
      );
    });

    it('should handle transaction errors', async () => {
      mockPrismaService.$transaction.mockRejectedValue(
        new Error('Transaction failed')
      );

      const assignDto: AssignGroupInkindDto = {
        inkindId: 'inkind-uuid',
        groupId: 'group-uuid',
        quantity: 1,
        user: mockUser,
      };

      await expect(service.assignGroupInkind(assignDto)).rejects.toThrow(
        RpcException
      );
    });
  });

  describe('getByGroup', () => {
    const mockGroupInkinds = [
      {
        uuid: 'group-inkind-1',
        groupId: 'group-1',
        inkindId: 'inkind-1',
        quantityAllocated: 2,
        inkind: {
          uuid: 'inkind-1',
          name: 'Rice Bag',
          type: InkindType.WALK_IN,
          description: '25kg rice bag',
        },
        group: {
          uuid: 'group-1',
          name: 'Group A',
          _count: { beneficiaries: 10 },
        },
      },
      {
        uuid: 'group-inkind-2',
        groupId: 'group-2',
        inkindId: 'inkind-2',
        quantityAllocated: 1,
        inkind: {
          uuid: 'inkind-2',
          name: 'Oil Bottle',
          type: InkindType.PRE_DEFINED,
          description: '1L oil bottle',
        },
        group: {
          uuid: 'group-2',
          name: 'Group B',
          _count: { beneficiaries: 0 },
        },
      },
    ];

    it('should return group inkinds successfully', async () => {
      mockPrismaService.groupInkind.findMany.mockResolvedValue(
        mockGroupInkinds
      );

      const result = await service.getByGroup();

      expect(mockPrismaService.groupInkind.findMany).toHaveBeenCalledWith({
        include: {
          inkind: true,
          group: {
            include: {
              _count: {
                select: { beneficiaries: true },
              },
            },
          },
        },
      });
      expect(result).toEqual(mockGroupInkinds);
    });

    it('should include beneficiary count in group data', async () => {
      const withCount = [
        {
          ...mockGroupInkinds[0],
          group: { ...mockGroupInkinds[0].group, _count: { beneficiaries: 5 } },
        },
      ];
      mockPrismaService.groupInkind.findMany.mockResolvedValue(withCount);

      const result = await service.getByGroup();

      expect(result[0].group._count.beneficiaries).toBe(5);
    });

    it('should return empty array when no group inkinds exist', async () => {
      mockPrismaService.groupInkind.findMany.mockResolvedValue([]);

      const result = await service.getByGroup();

      expect(result).toEqual([]);
    });

    it('should throw RpcException when database error occurs', async () => {
      mockPrismaService.groupInkind.findMany.mockRejectedValue(
        new Error('Database error')
      );

      await expect(service.getByGroup()).rejects.toThrow(RpcException);
    });
  });
});
