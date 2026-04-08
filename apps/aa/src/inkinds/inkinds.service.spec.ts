import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { InkindsService } from './inkinds.service';
import { InkindType, InkindTxStatus, ListInkindDto } from './dto/inkind.dto';
import { InkindStockMovementType } from '@prisma/client';
import { AddInkindStockDto, ListStockMovementsDto, RemoveInkindStockDto } from './dto/inkindStock.dto';
import { AssignGroupInkindDto } from './dto/inkindGroup.dto';
import { CHAIN_SERVICE, CORE_MODULE } from '../constants';

// Mock @rumsan/prisma — expose the paginate fn so tests can control it
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
  const mockPaginateFn = require('@rumsan/prisma').__mockPaginateFn as jest.Mock;

  // Transaction context mock — mirrors every model used inside $transaction callbacks
  const mockTx = {
    inkind: { create: jest.fn(), findMany: jest.fn() },
    inkindStockMovement: { create: jest.fn() },
    groupInkind: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    beneficiaryInkindRedemption: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    beneficiaryToGroup: { create: jest.fn(), findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    beneficiary: { findFirst: jest.fn() },
    beneficiaryGroup: { create: jest.fn() },
  };

  const mockPrismaService = {
    inkind: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    inkindStockMovement: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    groupInkind: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    beneficiaryToGroup: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    beneficiary: { findFirst: jest.fn() },
    beneficiaryInkindRedemption: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    vendor: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    otp: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    beneficiaryGroups: { findMany: jest.fn() },
    $transaction: jest.fn((cb) => cb(mockTx)),
  };

  const mockOtpService = { sendSms: jest.fn() };
  const mockConfigService = { get: jest.fn() };
  const mockChainService = { redeemInkind: jest.fn() };
  const mockClient = { send: jest.fn(), emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InkindsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'OtpService', useValue: mockOtpService },
        { provide: 'ConfigService', useValue: mockConfigService },
        { provide: CHAIN_SERVICE, useValue: mockChainService },
        { provide: CORE_MODULE, useValue: mockClient },
      ],
    })
      .useMocker((token) => {
        // catch remaining tokens (OtpService class, ConfigService class)
        if (typeof token === 'function' && token.name === 'OtpService') return mockOtpService;
        if (typeof token === 'function' && token.name === 'ConfigService') return mockConfigService;
        return undefined;
      })
      .compile();

    service = module.get<InkindsService>(InkindsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockPaginateFn.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = { name: 'Rice', type: InkindType.WALK_IN, description: 'desc' };
    const mockInkind = {
      uuid: 'uuid-1', id: 1, name: 'Rice', type: InkindType.WALK_IN,
      description: 'desc', image: null, availableStock: 0,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    };

    it('creates inkind without initial stock', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockResolvedValue(mockInkind);

      const result = await service.create(baseDto);

      expect(mockPrismaService.inkind.findFirst).toHaveBeenCalledWith({ where: { name: 'Rice', deletedAt: null } });
      expect(mockTx.inkindStockMovement.create).not.toHaveBeenCalled();
      expect(result.name).toBe('Rice');
    });

    it('creates inkind with initial stock movement', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockResolvedValue(mockInkind);

      const result = await service.create({ ...baseDto, quantity: 50 });

      expect(mockTx.inkindStockMovement.create).toHaveBeenCalledWith({
        data: { inkindId: 'uuid-1', quantity: 50, type: InkindStockMovementType.ADD },
      });
      expect(result.availableStock).toBe(50);
    });

    it('throws RpcException when name already exists', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(mockInkind);

      await expect(service.create(baseDto)).rejects.toThrow(RpcException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws RpcException on db failure', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);
      mockTx.inkind.create.mockRejectedValue(new Error('db error'));

      await expect(service.create(baseDto)).rejects.toThrow(RpcException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    const existing = {
      uuid: 'uuid-1', id: 1, name: 'Rice', type: InkindType.WALK_IN,
      description: 'desc', image: null, availableStock: 0,
      createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    };

    it('updates inkind successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.inkind.update.mockResolvedValue({ ...existing, name: 'Oil' });

      const result = await service.update({ uuid: 'uuid-1', name: 'Oil' });

      expect(mockPrismaService.inkind.update).toHaveBeenCalledWith({
        where: { uuid: 'uuid-1' },
        data: { name: 'Oil' },
      });
      expect(result.name).toBe('Oil');
    });

    it('throws RpcException when not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.update({ uuid: 'bad-uuid' })).rejects.toThrow(RpcException);
    });

    it('throws RpcException on db failure during update', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.inkind.update.mockRejectedValue(new Error('db error'));

      await expect(service.update({ uuid: 'uuid-1', name: 'Oil' })).rejects.toThrow(RpcException);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    const existing = {
      uuid: 'uuid-1', id: 1, name: 'Rice', type: InkindType.WALK_IN,
      deletedAt: null, availableStock: 0, createdAt: new Date(), updatedAt: new Date(),
    };

    it('soft-deletes inkind successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.inkind.update.mockResolvedValue({ ...existing, deletedAt: new Date() });

      const result = await service.delete('uuid-1');

      expect(mockPrismaService.inkind.update).toHaveBeenCalledWith({
        where: { uuid: 'uuid-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result.success).toBe(true);
    });

    it('throws RpcException when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.delete('bad-uuid')).rejects.toThrow(RpcException);
      expect(mockPrismaService.inkind.update).not.toHaveBeenCalled();
    });
  });

  // ─── get ───────────────────────────────────────────────────────────────────

  describe('get', () => {
    const baseResult = {
      data: [{ uuid: 'uuid-1', name: 'Rice', type: InkindType.WALK_IN }],
      meta: { total: 1, page: 1, perPage: 10, totalPages: 1 },
    };

    beforeEach(() => {
      mockPrismaService.groupInkind.groupBy.mockResolvedValue([]);
    });

    it('returns paginated list with filters', async () => {
      mockPaginateFn.mockResolvedValue(baseResult);

      const payload: ListInkindDto = { page: 1, perPage: 10, type: InkindType.WALK_IN, name: 'Ri', sort: 'name', order: 'asc' };
      const result = await service.get(payload);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkind,
        expect.objectContaining({ where: expect.objectContaining({ type: InkindType.WALK_IN }) }),
        { page: 1, perPage: 10 },
      );
      expect(result.data).toHaveLength(1);
    });

    it('uses default sort and order when not provided', async () => {
      mockPaginateFn.mockResolvedValue(baseResult);

      await service.get({ page: 1, perPage: 5 });

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkind,
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
        { page: 1, perPage: 5 },
      );
    });

    it('falls back to createdAt for invalid sort field', async () => {
      mockPaginateFn.mockResolvedValue(baseResult);

      await service.get({ page: 1, perPage: 5, sort: 'invalid' as any });

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkind,
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
        { page: 1, perPage: 5 },
      );
    });

    it('merges assignment totals from groupBy', async () => {
      mockPaginateFn.mockResolvedValue(baseResult);
      mockPrismaService.groupInkind.groupBy.mockResolvedValue([
        { inkindId: 'uuid-1', _sum: { quantityAllocated: 20, quantityRedeemed: 5 } },
      ]);

      const result = await service.get({ page: 1, perPage: 10 });

      expect((result.data[0] as any).totalAssigned).toBe(20);
      expect((result.data[0] as any).totalRedeemed).toBe(5);
    });

    it('throws RpcException when paginate fails', async () => {
      mockPaginateFn.mockRejectedValue(new Error('db error'));

      await expect(service.get({ page: 1, perPage: 10 })).rejects.toThrow(RpcException);
    });
  });

  // ─── getInkindSummary ──────────────────────────────────────────────────────

  describe('getInkindSummary', () => {
    it('returns summary with correct calculations', async () => {
      mockPrismaService.inkind.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: { availableStock: 200 },
      });
      mockPrismaService.groupInkind.aggregate.mockResolvedValue({
        _sum: { quantityAllocated: 80, quantityRedeemed: 30 },
      });

      const result = await service.getInkindSummary();

      expect(result.totalInkindTypes).toBe(5);
      expect(result.totalStock).toBe(200);
      expect(result.totalAvailableStock).toBe(120); // 200 - 80
      expect(result.totalAssignedStock).toBe(80);
      expect(result.totalRedeemedStock).toBe(30);
    });

    it('handles null sums gracefully', async () => {
      mockPrismaService.inkind.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { availableStock: null },
      });
      mockPrismaService.groupInkind.aggregate.mockResolvedValue({
        _sum: { quantityAllocated: null, quantityRedeemed: null },
      });

      const result = await service.getInkindSummary();

      expect(result.totalInkindTypes).toBe(0);
      // null - 0 evaluates to 0 in JS
      expect(result.totalAvailableStock).toBe(0);
    });

    it('throws RpcException on failure', async () => {
      mockPrismaService.inkind.aggregate.mockRejectedValue(new Error('db error'));

      await expect(service.getInkindSummary()).rejects.toThrow(RpcException);
    });
  });

  // ─── getOne ────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    const existing = {
      uuid: 'uuid-1', id: 1, name: 'Rice', type: InkindType.WALK_IN,
      deletedAt: null, availableStock: 50, createdAt: new Date(), updatedAt: new Date(),
    };

    it('returns inkind with aggregated totals', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.groupInkind.aggregate.mockResolvedValue({
        _sum: { quantityAllocated: 40, quantityRedeemed: 10 },
      });

      const result = await service.getOne('uuid-1');

      expect(result.uuid).toBe('uuid-1');
      expect(result.totalAssigned).toBe(40);
      expect(result.totalRedeemed).toBe(10);
    });

    it('throws when not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.getOne('bad-uuid')).rejects.toThrow(RpcException);
    });
  });

  // ─── addInkindStock ────────────────────────────────────────────────────────

  describe('addInkindStock', () => {
    const existing = { uuid: 'uuid-1', name: 'Rice', availableStock: 100 };
    const mockMovement = { uuid: 'mov-1', inkindId: 'uuid-1', quantity: 50, type: InkindStockMovementType.ADD, createdAt: new Date() };

    beforeEach(() => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.inkindStockMovement.create.mockResolvedValue(mockMovement);
    });

    it('adds stock successfully', async () => {
      const dto: AddInkindStockDto = { inkindId: 'uuid-1', quantity: 50 };

      const result = await service.addInkindStock(dto);

      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith({
        data: { inkindId: 'uuid-1', quantity: 50, type: InkindStockMovementType.ADD, groupInkindId: undefined, redemptionId: undefined },
      });
      expect(result).toEqual(mockMovement);
    });

    it('adds stock with optional groupInkindId and redemptionId', async () => {
      const dto: AddInkindStockDto = { inkindId: 'uuid-1', quantity: 25, groupInkindId: 'gi-uuid', redemptionId: 'red-uuid' };

      await service.addInkindStock(dto);

      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith({
        data: { inkindId: 'uuid-1', quantity: 25, type: InkindStockMovementType.ADD, groupInkindId: 'gi-uuid', redemptionId: 'red-uuid' },
      });
    });

    it('throws for empty inkindId', async () => {
      await expect(service.addInkindStock({ inkindId: '', quantity: 50 })).rejects.toThrow('Missing or invalid required fields');
    });

    it('throws for zero quantity', async () => {
      await expect(service.addInkindStock({ inkindId: 'uuid-1', quantity: 0 })).rejects.toThrow('Missing or invalid required fields');
    });

    it('throws when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.addInkindStock({ inkindId: 'bad-uuid', quantity: 10 })).rejects.toThrow('Inkind with UUID bad-uuid not found');
    });
  });

  // ─── getAllStockMovements ───────────────────────────────────────────────────

  describe('getAllStockMovements', () => {
    const mockMovements = [
      { uuid: 'mov-1', inkindId: 'uuid-1', quantity: 100, type: InkindStockMovementType.ADD, inkind: { name: 'Rice' }, groupInkind: null, redemption: null, createdAt: new Date() },
    ];

    it('returns paginated stock movements without type filter', async () => {
      mockPaginateFn.mockResolvedValue({ data: mockMovements, meta: { total: 1, page: 1, perPage: 10, totalPages: 1 } });

      const dto: ListStockMovementsDto = { page: 1, perPage: 10, order: 'desc' };
      const result = await service.getAllStockMovements(dto);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkindStockMovement,
        expect.objectContaining({ where: { type: { not: InkindStockMovementType.REDEEM } }, orderBy: { createdAt: 'desc' } }),
        { page: 1, perPage: 10 },
      );
      expect(result.data).toHaveLength(1);
    });

    it('filters by type when provided', async () => {
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      const dto: ListStockMovementsDto = { page: 1, perPage: 10, type: InkindStockMovementType.ADD };
      await service.getAllStockMovements(dto);

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.inkindStockMovement,
        expect.objectContaining({ where: { type: InkindStockMovementType.ADD } }),
        { page: 1, perPage: 10 },
      );
    });

    it('rejects when paginate fails', async () => {
      mockPaginateFn.mockRejectedValue(new Error('db error'));

      // paginate is called without await in the service, so the raw Error propagates
      await expect(service.getAllStockMovements({ page: 1, perPage: 10 })).rejects.toThrow('db error');
    });
  });

  // ─── removeInkindStock ─────────────────────────────────────────────────────

  describe('removeInkindStock', () => {
    const existing = { uuid: 'uuid-1', name: 'Rice', availableStock: 100 };
    const mockMovement = { uuid: 'mov-1', inkindId: 'uuid-1', quantity: 25, type: InkindStockMovementType.REMOVE, createdAt: new Date() };

    beforeEach(() => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(existing);
      mockPrismaService.inkindStockMovement.create.mockResolvedValue(mockMovement);
    });

    it('removes stock successfully', async () => {
      const dto: RemoveInkindStockDto = { inkindUuid: 'uuid-1', quantity: 25 };

      const result = await service.removeInkindStock(dto);

      expect(mockPrismaService.inkindStockMovement.create).toHaveBeenCalledWith({
        data: { inkindId: 'uuid-1', quantity: 25, type: InkindStockMovementType.REMOVE },
      });
      expect(result).toEqual(mockMovement);
    });

    it('throws for empty inkindUuid', async () => {
      await expect(service.removeInkindStock({ inkindUuid: '', quantity: 25 })).rejects.toThrow('Missing inkindUuid field');
    });

    it('throws when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.removeInkindStock({ inkindUuid: 'bad-uuid', quantity: 10 })).rejects.toThrow('Inkind with UUID bad-uuid not found');
    });
  });

  // ─── getUnassignedInkindGroups ─────────────────────────────────────────────

  describe('getUnassignedInkindGroups', () => {
    it('returns unassigned groups', async () => {
      const groups = [{ uuid: 'g-1', name: 'Group A' }];
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(groups);

      const result = await service.getUnassignedInkindGroups('uuid-1');

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ NOT: { name: { startsWith: 'Walk-in' } } }) }),
      );
      expect(result).toEqual(groups);
    });

    it('returns empty when all groups are assigned', async () => {
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([]);

      const result = await service.getUnassignedInkindGroups('uuid-1');

      expect(result).toEqual([]);
    });

    it('throws RpcException on db error', async () => {
      mockPrismaService.beneficiaryGroups.findMany.mockRejectedValue(new Error('db error'));

      await expect(service.getUnassignedInkindGroups('uuid-1')).rejects.toThrow(RpcException);
    });
  });

  // ─── assignGroupInkind ─────────────────────────────────────────────────────

  describe('assignGroupInkind', () => {
    const mockUser = { id: 1, userId: 1, uuid: 'user-uuid', name: 'Admin', email: 'a@b.com', phone: null, wallet: '0xabc' };
    const preDefinedInkind = { uuid: 'inkind-uuid', name: 'Kit', type: InkindType.PRE_DEFINED, availableStock: 100 };
    const mockGroupInkind = { uuid: 'gi-uuid', groupId: 'group-uuid', inkindId: 'inkind-uuid', quantityAllocated: 10 };

    it('assigns PRE_DEFINED inkind to group successfully', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(preDefinedInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(5);
      mockTx.groupInkind.create.mockResolvedValue(mockGroupInkind);

      const dto: AssignGroupInkindDto = { inkindId: 'inkind-uuid', groupId: 'group-uuid', quantity: 2, user: mockUser };
      const result = await service.assignGroupInkind(dto);

      expect(mockTx.groupInkind.create).toHaveBeenCalledWith({
        data: { groupId: 'group-uuid', inkindId: 'inkind-uuid', quantityAllocated: 10, createdBy: 'Admin' },
      });
      expect(mockTx.inkindStockMovement.create).toHaveBeenCalledWith({
        data: { inkindId: 'inkind-uuid', quantity: 10, type: InkindStockMovementType.LOCK, groupInkindId: 'gi-uuid' },
      });
      expect(result.success).toBe(true);
    });

    it('uses quantity 1 when not provided', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(preDefinedInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(3);
      mockTx.groupInkind.create.mockResolvedValue({ ...mockGroupInkind, quantityAllocated: 3 });

      await service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'group-uuid', user: mockUser });

      // quantity 1 * 3 beneficiaries = 3
      expect(mockTx.groupInkind.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantityAllocated: 3 }) }),
      );
    });

    it('throws for missing inkindId', async () => {
      await expect(service.assignGroupInkind({ inkindId: '', groupId: 'g', user: mockUser })).rejects.toThrow('Missing required fields');
    });

    it('throws for missing groupId', async () => {
      await expect(service.assignGroupInkind({ inkindId: 'uuid-1', groupId: '', user: mockUser })).rejects.toThrow('Missing required fields');
    });

    it('throws when inkind not found', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(null);

      await expect(service.assignGroupInkind({ inkindId: 'bad-uuid', groupId: 'g', user: mockUser })).rejects.toThrow('Inkind with UUID bad-uuid not found');
    });

    it('throws for WALK_IN type inkind', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue({ uuid: 'inkind-uuid', name: 'Food', type: InkindType.WALK_IN, availableStock: 100 });

      await expect(service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'g', user: mockUser })).rejects.toThrow('Walk-in inkinds cannot be assigned to groups');
    });

    it('throws when already assigned to group', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(preDefinedInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(mockGroupInkind);

      await expect(service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'group-uuid', user: mockUser })).rejects.toThrow('Inkind is already assigned to this group.');
    });

    it('throws when no beneficiaries in group', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(preDefinedInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(0);

      await expect(service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'group-uuid', quantity: 1, user: mockUser })).rejects.toThrow('No beneficiaries found in the group.');
    });

    it('throws when insufficient stock', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue({ ...preDefinedInkind, availableStock: 5 });
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(10);

      // 2 * 10 = 20 > 5
      await expect(service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'group-uuid', quantity: 2, user: mockUser })).rejects.toThrow('Not enough stock available. Requested: 20, Available: 5');
    });

    it('throws on transaction failure', async () => {
      mockPrismaService.inkind.findFirst.mockResolvedValue(preDefinedInkind);
      mockPrismaService.groupInkind.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryToGroup.count.mockResolvedValue(2);
      mockPrismaService.$transaction.mockRejectedValueOnce(new Error('tx failed'));

      await expect(service.assignGroupInkind({ inkindId: 'inkind-uuid', groupId: 'group-uuid', quantity: 1, user: mockUser })).rejects.toThrow(RpcException);
    });
  });

  // ─── getByGroup ────────────────────────────────────────────────────────────

  describe('getByGroup', () => {
    const mockGroupInkinds = [
      {
        uuid: 'gi-1', groupId: 'g-1', inkindId: 'i-1', quantityAllocated: 10,
        inkind: { uuid: 'i-1', name: 'Rice', type: InkindType.WALK_IN },
        group: { uuid: 'g-1', name: 'Group A', _count: { beneficiaries: 5 } },
      },
    ];

    it('returns all group inkinds without filter', async () => {
      mockPrismaService.groupInkind.findMany.mockResolvedValue(mockGroupInkinds);

      const result = await service.getByGroup();

      expect(mockPrismaService.groupInkind.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
      expect(result).toEqual(mockGroupInkinds);
    });

    it('filters by inkindType when provided', async () => {
      mockPrismaService.groupInkind.findMany.mockResolvedValue(mockGroupInkinds);

      await service.getByGroup(InkindType.WALK_IN);

      expect(mockPrismaService.groupInkind.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inkind: { type: InkindType.WALK_IN } } }),
      );
    });

    it('returns empty array when none exist', async () => {
      mockPrismaService.groupInkind.findMany.mockResolvedValue([]);

      expect(await service.getByGroup()).toEqual([]);
    });

    it('throws RpcException on db error', async () => {
      mockPrismaService.groupInkind.findMany.mockRejectedValue(new Error('db error'));

      await expect(service.getByGroup()).rejects.toThrow(RpcException);
    });
  });

  // ─── getAvailableInkindByBeneficiary ───────────────────────────────────────

  describe('getAvailableInkindByBeneficiary', () => {
    const mockBeneficiary = { uuid: 'ben-uuid', walletAddress: '0xabc', extras: { phone: '9800000000' } };

    it('throws when phone number is empty', async () => {
      await expect(service.getAvailableInkindByBeneficiary('')).rejects.toThrow('Beneficiary phone number is required');
    });

    it('returns isBeneficiaryExists=false when not found', async () => {
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(null);

      const result = await service.getAvailableInkindByBeneficiary('9800000000');

      expect(result.isBeneficiaryExists).toBe(false);
      expect(result.preDefinedInkinds).toEqual([]);
      expect(result.walkInInkinds).toEqual([]);
    });

    it('returns grouped inkinds when beneficiary found', async () => {
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([]);
      mockPrismaService.inkind.findMany.mockResolvedValue([]);

      const result = await service.getAvailableInkindByBeneficiary('9800000000');

      expect(result.isBeneficiaryExists).toBe(true);
      expect(result.beneficiary).toEqual(mockBeneficiary);
    });

    it('throws RpcException on db error', async () => {
      mockPrismaService.beneficiary.findFirst.mockRejectedValue(new Error('db error'));

      await expect(service.getAvailableInkindByBeneficiary('9800000000')).rejects.toThrow(RpcException);
    });
  });

  // ─── getLogsByGroupInkind ──────────────────────────────────────────────────

  describe('getLogsByGroupInkind', () => {
    const mockGroupInkind = {
      uuid: 'gi-uuid',
      inkind: { uuid: 'i-uuid', name: 'Rice', type: InkindType.PRE_DEFINED },
      group: { uuid: 'g-uuid', name: 'Group A', _count: { beneficiaries: 10 } },
      quantityAllocated: 100,
      quantityRedeemed: 20,
    };

    it('throws when groupInkindId is missing', async () => {
      await expect(service.getLogsByGroupInkind({ groupInkindId: '' })).rejects.toThrow('groupInkindId is required');
    });

    it('throws when groupInkind not found', async () => {
      mockPrismaService.groupInkind.findUnique.mockResolvedValue(null);

      await expect(service.getLogsByGroupInkind({ groupInkindId: 'bad-uuid' })).rejects.toThrow('GroupInkind with UUID bad-uuid not found');
    });

    it('returns formatted logs successfully', async () => {
      mockPrismaService.groupInkind.findUnique.mockResolvedValue(mockGroupInkind);
      mockPaginateFn.mockResolvedValue({
        data: [{
          uuid: 'r-uuid', quantity: 10, redeemedAt: new Date(), txHash: '0xhash',
          beneficiary: { uuid: 'b-uuid', walletAddress: '0xabc', phone: '980', extras: { name: 'Alice' } },
          Vendor: { uuid: 'v-uuid', name: 'Vendor A', walletAddress: '0xv' },
        }],
        meta: { total: 1, page: 1, perPage: 10, totalPages: 1 },
      });

      const result = await service.getLogsByGroupInkind({ groupInkindId: 'gi-uuid', page: 1, perPage: 10 });

      expect(result.data.groupInkind.uuid).toBe('gi-uuid');
      expect(result.data.logs[0].beneficiary.name).toBe('Alice');
    });

    it('handles search filter', async () => {
      mockPrismaService.groupInkind.findUnique.mockResolvedValue(mockGroupInkind);
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      await service.getLogsByGroupInkind({ groupInkindId: 'gi-uuid', search: 'Alice' });

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.beneficiaryInkindRedemption,
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
        expect.any(Object),
      );
    });
  });

  // ─── getLogsByGroupInkindForVendor ─────────────────────────────────────────

  describe('getLogsByGroupInkindForVendor', () => {
    const mockVendor = { uuid: 'v-uuid', name: 'Vendor A', walletAddress: '0xv' };

    it('throws when vendorId is missing', async () => {
      await expect(service.getLogsByGroupInkindForVendor({ vendorId: '' })).rejects.toThrow('vendorId is required');
    });

    it('throws when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(service.getLogsByGroupInkindForVendor({ vendorId: 'bad-uuid' })).rejects.toThrow('Vendor with UUID bad-uuid not found');
    });

    it('returns vendor logs with stats', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryInkindRedemption.count.mockResolvedValue(10);
      mockPrismaService.beneficiaryInkindRedemption.aggregate.mockResolvedValue({ _sum: { quantity: 50 } });
      mockPaginateFn.mockResolvedValue({ data: [], meta: { total: 0 } });

      const result = await service.getLogsByGroupInkindForVendor({ vendorId: 'v-uuid', page: 1, perPage: 10 });

      expect(result.data.vendor.uuid).toBe('v-uuid');
      expect(result.data.stats.totalQuantityRedeemed).toBe(50);
    });

    it('handles date range filter', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryInkindRedemption.count.mockResolvedValue(0);
      mockPrismaService.beneficiaryInkindRedemption.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      mockPaginateFn.mockResolvedValue({ data: [], meta: {} });

      const from = '2025-01-01';
      const to = '2025-12-31';
      await service.getLogsByGroupInkindForVendor({ vendorId: 'v-uuid', fromDate: from, toDate: to });

      expect(mockPaginateFn).toHaveBeenCalledWith(
        mockPrismaService.beneficiaryInkindRedemption,
        expect.objectContaining({ where: expect.objectContaining({ redeemedAt: { gte: '2025-01-01', lte: '2025-12-31' } }) }),
        expect.any(Object),
      );
    });
  });

  // ─── getLogsDetailsByTxHash ────────────────────────────────────────────────

  describe('getLogsDetailsByTxHash', () => {
    it('throws when vendorUid is missing', async () => {
      await expect(service.getLogsDetailsByTxHash('0xhash', '')).rejects.toThrow('vendorUid is required');
    });

    it('throws when no redemptions found', async () => {
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      await expect(service.getLogsDetailsByTxHash('0xhash', 'v-uuid')).rejects.toThrow('No redemptions found for txHash: 0xhash');
    });

    it('returns formatted redemption details', async () => {
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([
        {
          uuid: 'r-uuid', txHash: '0xhash', redeemedAt: new Date(), quantity: 5,
          beneficiary: { walletAddress: '0xabc', extras: { phone: '9800000000' } },
          groupInkind: { inkind: { name: 'Rice', type: InkindType.PRE_DEFINED } },
        },
      ]);

      const result = await service.getLogsDetailsByTxHash('0xhash', 'v-uuid');

      expect(result.txHash).toBe('0xhash');
      expect(result.status).toBe('Completed');
      expect(result.claimedInkinds[0].name).toBe('Rice');
      expect(result.phone).toBe('9800000000');
    });

    it('returns Pending status when txHash is null-equivalent', async () => {
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([
        {
          uuid: 'r-uuid', txHash: null, redeemedAt: new Date(), quantity: 5,
          beneficiary: { walletAddress: '0xabc', extras: {} },
          groupInkind: { inkind: { name: 'Rice', type: InkindType.PRE_DEFINED } },
        },
      ]);

      const result = await service.getLogsDetailsByTxHash('', 'v-uuid');

      expect(result.status).toBe('Pending');
    });
  });

  // ─── sendBeneficiaryOtp ────────────────────────────────────────────────────

  describe('sendBeneficiaryOtp', () => {
    const mockBeneficiary = { uuid: 'b-uuid', walletAddress: '0xabc', extras: { phone: '9800000000' } };

    it('throws when phone number is empty', async () => {
      await expect(service.sendBeneficiaryOtp('')).rejects.toThrow('Missing phone number');
    });

    it('throws when beneficiary not found', async () => {
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(null);

      await expect(service.sendBeneficiaryOtp('9800000000')).rejects.toThrow('Beneficiary not found');
    });

    it('sends OTP and upserts record', async () => {
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockOtpService.sendSms.mockResolvedValue({ otp: '123456' });
      mockPrismaService.otp.upsert.mockResolvedValue({});

      const result = await service.sendBeneficiaryOtp('9800000000');

      expect(mockOtpService.sendSms).toHaveBeenCalledWith('9800000000', 'Your OTP for inkind redemption is:');
      expect(mockPrismaService.otp.upsert).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  // ─── validateBeneficiaryOtp ────────────────────────────────────────────────

  describe('validateBeneficiaryOtp', () => {
    it('throws when phone or otp missing', async () => {
      await expect(service.validateBeneficiaryOtp('', '1234')).rejects.toThrow('Missing phone number or OTP');
      await expect(service.validateBeneficiaryOtp('9800000000', '')).rejects.toThrow('Missing phone number or OTP');
    });

    it('throws when OTP record not found', async () => {
      mockPrismaService.otp.findUnique.mockResolvedValue(null);

      await expect(service.validateBeneficiaryOtp('9800000000', '1234')).rejects.toThrow('OTP record not found');
    });

    it('throws when OTP already verified', async () => {
      mockPrismaService.otp.findUnique.mockResolvedValue({ isVerified: true, expiresAt: new Date(Date.now() + 60000), otpHash: 'hash' });

      await expect(service.validateBeneficiaryOtp('9800000000', '1234')).rejects.toThrow('OTP already verified');
    });

    it('throws when OTP expired', async () => {
      mockPrismaService.otp.findUnique.mockResolvedValue({ isVerified: false, expiresAt: new Date(Date.now() - 1000), otpHash: 'hash' });

      await expect(service.validateBeneficiaryOtp('9800000000', '1234')).rejects.toThrow('OTP has expired');
    });

    it('throws for invalid OTP', async () => {
      // bcrypt.compare will return false for mismatched hash
      mockPrismaService.otp.findUnique.mockResolvedValue({
        isVerified: false,
        expiresAt: new Date(Date.now() + 60000),
        otpHash: '$2b$10$invalidhashvalue00000000000000000000000000000000000000000',
      });

      await expect(service.validateBeneficiaryOtp('9800000000', 'wrong')).rejects.toThrow('Invalid OTP');
    });

    it('validates OTP and marks as verified', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('123456', 10);

      mockPrismaService.otp.findUnique.mockResolvedValue({ isVerified: false, expiresAt: new Date(Date.now() + 60000), otpHash: hash });
      mockPrismaService.otp.update.mockResolvedValue({});

      const result = await service.validateBeneficiaryOtp('9800000000', '123456');

      expect(mockPrismaService.otp.update).toHaveBeenCalledWith({ where: { phoneNumber: '9800000000' }, data: { isVerified: true } });
      expect(result.success).toBe(true);
    });
  });

  // ─── updateRedeemInkindTxHash ──────────────────────────────────────────────

  describe('updateRedeemInkindTxHash', () => {
    it('updates txHash and status successfully', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.updateRedeemInkindTxHash(['i-uuid-1', 'i-uuid-2'], '0xhash', '0xwallet');

      expect(mockPrismaService.beneficiaryInkindRedemption.updateMany).toHaveBeenCalledWith({
        where: { beneficiaryWallet: '0xwallet', groupInkind: { inkindId: { in: ['i-uuid-1', 'i-uuid-2'] } } },
        data: { txHash: '0xhash', status: InkindTxStatus.COMPLETED },
      });
      expect(result.success).toBe(true);
    });

    it('throws RpcException on db error', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockRejectedValue(new Error('db error'));

      await expect(service.updateRedeemInkindTxHash(['i-uuid'], '0xhash', '0xwallet')).rejects.toThrow(RpcException);
    });
  });

  // ─── beneficiaryInkindRedeem ───────────────────────────────────────────────

  describe('beneficiaryInkindRedeem', () => {
    const walletAddress = '0xbeneficiary';
    const vendorUuid = 'vendor-uuid';
    const beneficiaryUuid = 'ben-uuid';

    const mockVendor = { uuid: vendorUuid, name: 'Vendor A', walletAddress: '0xvendor' };
    const mockBeneficiary = { uuid: beneficiaryUuid, walletAddress };

    const preDefinedInkind = { uuid: 'i-uuid-1', name: 'Rice Kit', type: InkindType.PRE_DEFINED, deletedAt: null };
    const walkInInkind = { uuid: 'i-uuid-2', name: 'Food Pack', type: InkindType.WALK_IN, deletedAt: null };

    const mockGroupInkind = {
      uuid: 'gi-uuid', inkindId: 'i-uuid-1', groupId: 'g-uuid', quantityAllocated: 100, quantityRedeemed: 0,
      group: { uuid: 'g-uuid', beneficiaries: [{ beneficiaryId: beneficiaryUuid }], _count: { beneficiaries: 10 } },
      inkind: preDefinedInkind,
    };

    const user = { uuid: vendorUuid, name: 'Vendor A', wallet: '0xvendor', id: 1, userId: 1, email: 'a@b.com', phone: null };

    it('throws for missing walletAddress or empty inkinds', async () => {
      await expect(service.beneficiaryInkindRedeem({ walletAddress: '', inkinds: [{ uuid: 'i-uuid-1' }], user })).rejects.toThrow('Missing required fields');
      await expect(service.beneficiaryInkindRedeem({ walletAddress, inkinds: [], user })).rejects.toThrow('Missing required fields');
    });

    it('throws when vendor not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(null);

      await expect(service.beneficiaryInkindRedeem({ walletAddress, inkinds: [{ uuid: 'i-uuid-1' }], user })).rejects.toThrow(RpcException);
    });

    it('throws when inkind record count mismatches', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([]);

      await expect(service.beneficiaryInkindRedeem({ walletAddress, inkinds: [{ uuid: 'i-uuid-1' }], user })).rejects.toThrow('One or more inkinds not found');
    });

    it('throws when beneficiary not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(null);

      await expect(service.beneficiaryInkindRedeem({ walletAddress, inkinds: [{ uuid: 'i-uuid-1' }], user })).rejects.toThrow('Beneficiary not found');
    });

    it('throws when groupInkindUuid missing for PRE_DEFINED inkind', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      // groupInkind.findMany won't even be reached since validation throws first

      await expect(service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-1' }], // no groupInkindUuid
        user,
      })).rejects.toThrow('Missing groupInkindUuid for PRE_DEFINED inkind');
    });

    it('throws when beneficiary not member of group', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([{ ...mockGroupInkind, group: { ...mockGroupInkind.group, beneficiaries: [] } }]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      await expect(service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-1', groupInkindUuid: 'gi-uuid' }],
        user,
      })).rejects.toThrow('Beneficiary is not a member of group');
    });

    it('throws when already redeemed PRE_DEFINED inkind', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([
        { uuid: 'r-uuid', groupInkind: { inkind: { name: 'Rice Kit' } } },
      ]);

      await expect(service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-1', groupInkindUuid: 'gi-uuid' }],
        user,
      })).rejects.toThrow('Beneficiary has already redeemed PRE_DEFINED inkinds');
    });

    it('successfully redeems PRE_DEFINED inkind', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      // walkIn validation returns early (no walk-in inkinds), only one findMany call needed
      mockPrismaService.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({ uuid: 'r-uuid', quantity: 10 });
      mockTx.inkindStockMovement.create.mockResolvedValue({});

      const result = await service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-1', groupInkindUuid: 'gi-uuid' }],
        user,
      });

      expect(result.redemptions).toHaveLength(1);
      expect(mockChainService.redeemInkind).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiaryAddress: walletAddress, vendorAddress: '0xvendor' }),
      );
    });

    it('returns no-op when all validations yield empty arrays', async () => {
      // PRE_DEFINED with no groupInkindUuid AND no walk-in → both arrays empty
      const mixedInkind = { uuid: 'i-uuid-3', name: 'Unknown', type: 'UNKNOWN_TYPE' as any, deletedAt: null };
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mixedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      const result = await service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-3' }],
        user,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('No inkinds to redeem');
    });

    it('continues gracefully when chainService.redeemInkind throws', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([preDefinedInkind]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      // validatePreDefinedInkinds calls groupInkind.findMany once, then beneficiaryInkindRedemption.findMany
      mockPrismaService.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({ uuid: 'r-uuid', quantity: 10 });
      mockTx.inkindStockMovement.create.mockResolvedValue({});
      mockChainService.redeemInkind.mockImplementation(() => { throw new Error('chain error'); });

      // Should NOT throw — chain error is swallowed inside try-catch in the service
      const result = await service.beneficiaryInkindRedeem({
        walletAddress,
        inkinds: [{ uuid: 'i-uuid-1', groupInkindUuid: 'gi-uuid' }],
        user,
      });

      expect(result.redemptions).toHaveLength(1);
    });
  });
});
