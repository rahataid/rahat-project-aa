import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { InkindsService } from './inkinds.service';
import { InkindType, ListInkindDto } from './dto/inkind.dto';

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
  };

  const mockPrismaService = {
    inkind: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
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
});
