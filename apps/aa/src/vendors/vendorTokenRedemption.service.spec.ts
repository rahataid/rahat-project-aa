import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { getQueueToken } from '@nestjs/bull';
import { BQUEUE, JOBS } from '../constants';

// Mock @rumsan/prisma paginator so we can control list() behavior
jest.mock('@rumsan/prisma', () => {
  const paginator = jest.fn().mockImplementation((_opts: any) => {
    return (model: any, args: any, options: any) => {
      // Simulate a simple paginator that proxies to findMany and returns meta
      return Promise.resolve(model.findMany(args)).then((results: any[]) => ({
        data: results,
        total: Array.isArray(results) ? results.length : 0,
        page: options?.page,
        perPage: options?.perPage,
      }));
    };
  });

  // Provide a dummy PrismaService token for DI; tests will override with useValue
  class PrismaService {}

  return { paginator, PrismaService, PaginatorTypes: {} };
});

import { PrismaService } from '@rumsan/prisma';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { TokenRedemptionStatus } from './dto/vendorTokenRedemption.dto';

describe('VendorTokenRedemptionService', () => {
  let service: VendorTokenRedemptionService;
  let prisma: any;
  let queue: any;

  const mockPrisma = {
    vendor: {
      findUnique: jest.fn(),
    },
    vendorTokenRedemption: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorTokenRedemptionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(BQUEUE.VENDOR), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<VendorTokenRedemptionService>(
      VendorTokenRedemptionService
    );
    prisma = module.get<PrismaService>(PrismaService);
    queue = module.get(getQueueToken(BQUEUE.VENDOR));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a redemption and enqueue verification job', async () => {
      const vendor = { uuid: 'v-1', name: 'Vendor One' };
      const dto = {
        vendorUuid: vendor.uuid,
        tokenAmount: 123,
        transactionHash: '0xabc',
      } as any;

      prisma.vendor.findUnique.mockResolvedValue(vendor);
      const created = {
        uuid: 'r-1',
        vendorUuid: vendor.uuid,
        tokenAmount: 123,
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
        transactionHash: '0xabc',
        vendor,
      };
      prisma.vendorTokenRedemption.create.mockResolvedValue(created);

      const res = await service.create(dto);

      expect(res).toEqual(created);
      expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid: vendor.uuid },
      });
      expect(prisma.vendorTokenRedemption.create).toHaveBeenCalledWith({
        data: {
          vendorUuid: vendor.uuid,
          tokenAmount: 123,
          redemptionStatus: TokenRedemptionStatus.REQUESTED,
          transactionHash: '0xabc',
        },
        include: { vendor: true },
      });
      expect(queue.add).toHaveBeenCalledWith(
        JOBS.VENDOR.VERIFY_TOKEN_REDEMPTION,
        { uuid: created.uuid, transactionHash: created.transactionHash },
        { delay: 1000 }
      );
    });

    it('should throw if vendor not found', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);
      const dto = { vendorUuid: 'missing', tokenAmount: 50 } as any;

      await expect(service.create(dto)).rejects.toThrow(RpcException);
      await expect(service.create(dto)).rejects.toHaveProperty(
        'message',
        'Vendor with UUID missing not found'
      );
      expect(prisma.vendorTokenRedemption.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should wrap and rethrow underlying errors', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ uuid: 'v-1' });
      prisma.vendorTokenRedemption.create.mockRejectedValue(
        new Error('db error')
      );

      await expect(
        service.create({ vendorUuid: 'v-1', tokenAmount: 1 } as any)
      ).rejects.toThrow(RpcException);
      await expect(
        service.create({ vendorUuid: 'v-1', tokenAmount: 1 } as any)
      ).rejects.toHaveProperty('message', 'db error');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should create with null transactionHash when not provided', async () => {
      const vendor = { uuid: 'v-2' };
      prisma.vendor.findUnique.mockResolvedValue(vendor);
      const created = {
        uuid: 'r-2',
        vendorUuid: vendor.uuid,
        tokenAmount: 50,
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
        transactionHash: null,
        vendor,
      };
      prisma.vendorTokenRedemption.create.mockResolvedValue(created);

      const res = await service.create({ vendorUuid: 'v-2', tokenAmount: 50 } as any);
      expect(res).toEqual(created);
      expect(prisma.vendorTokenRedemption.create).toHaveBeenCalledWith({
        data: {
          vendorUuid: 'v-2',
          tokenAmount: 50,
          redemptionStatus: TokenRedemptionStatus.REQUESTED,
          transactionHash: null,
        },
        include: { vendor: true },
      });
      expect(queue.add).toHaveBeenCalledWith(
        JOBS.VENDOR.VERIFY_TOKEN_REDEMPTION,
        { uuid: created.uuid, transactionHash: null },
        { delay: 1000 }
      );
    });
  });

  describe('findOne', () => {
    it('should return a redemption by uuid', async () => {
      const redemption = { uuid: 'r-1', vendor: {} };
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue(redemption);

      const res = await service.findOne({ uuid: 'r-1' } as any);
      expect(res).toBe(redemption);
      expect(prisma.vendorTokenRedemption.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'r-1' },
        include: { vendor: true },
      });
    });

    it('should throw if redemption not found', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue(null);
      await expect(service.findOne({ uuid: 'r-x' } as any)).rejects.toHaveProperty(
        'message',
        'Token redemption with UUID r-x not found'
      );
    });

    it('should handle errors', async () => {
      prisma.vendorTokenRedemption.findUnique.mockRejectedValue(
        new Error('read error')
      );
      await expect(service.findOne({ uuid: 'r-1' } as any)).rejects.toHaveProperty(
        'message',
        'read error'
      );
    });
  });

  describe('update', () => {
    it('should update redemption status when allowed', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue({
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
      });

      const updated = {
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.APPROVED,
        approvedBy: 'admin-1',
        approvedAt: new Date(),
        transactionHash: '0xhash',
        vendor: {},
      };
      prisma.vendorTokenRedemption.update.mockResolvedValue(updated);

      const res = await service.update({
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.APPROVED,
        approvedBy: 'admin-1',
        transactionHash: '0xhash',
      } as any);

      expect(res).toBe(updated);
      expect(prisma.vendorTokenRedemption.update).toHaveBeenCalledWith({
        where: { uuid: 'r-1' },
        data: {
          redemptionStatus: TokenRedemptionStatus.APPROVED,
          approvedBy: 'admin-1',
          approvedAt: expect.any(Date),
          transactionHash: '0xhash',
        },
        include: { vendor: true },
      });
    });

    it('should throw if redemption does not exist', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue(null);
      await expect(
        service.update({ uuid: 'r-x', redemptionStatus: TokenRedemptionStatus.APPROVED } as any)
      ).rejects.toHaveProperty('message', 'Token redemption with UUID r-x not found');
      expect(prisma.vendorTokenRedemption.update).not.toHaveBeenCalled();
    });

    it('should reject update if current status is not REQUESTED or STELLAR_VERIFIED', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue({
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.APPROVED,
      });

      await expect(
        service.update({ uuid: 'r-1', redemptionStatus: TokenRedemptionStatus.REJECTED } as any)
      ).rejects.toHaveProperty(
        'message',
        'Token redemption r-1 is not in REQUESTED or STELLAR_VERIFIED status'
      );
      expect(prisma.vendorTokenRedemption.update).not.toHaveBeenCalled();
    });

    it('should reject invalid target status', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue({
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
      });

      await expect(
        service.update({ uuid: 'r-1', redemptionStatus: TokenRedemptionStatus.REQUESTED } as any)
      ).rejects.toHaveProperty(
        'message',
        'Invalid status update. Only APPROVED, REJECTED, STELLAR_VERIFIED, or STELLAR_FAILED status is allowed'
      );
      expect(prisma.vendorTokenRedemption.update).not.toHaveBeenCalled();
    });

    it('should handle errors during update', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue({
        uuid: 'r-1',
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
      });
      prisma.vendorTokenRedemption.update.mockRejectedValue(
        new Error('update failed')
      );

      await expect(
        service.update({ uuid: 'r-1', redemptionStatus: TokenRedemptionStatus.APPROVED } as any)
      ).rejects.toHaveProperty('message', 'update failed');
    });

    it('should allow update from STELLAR_VERIFIED to STELLAR_FAILED', async () => {
      prisma.vendorTokenRedemption.findUnique.mockResolvedValue({
        uuid: 'r-2',
        redemptionStatus: TokenRedemptionStatus.STELLAR_VERIFIED,
      });
      const updated = { uuid: 'r-2', redemptionStatus: TokenRedemptionStatus.STELLAR_FAILED, vendor: {} };
      prisma.vendorTokenRedemption.update.mockResolvedValue(updated);

      const res = await service.update({
        uuid: 'r-2',
        redemptionStatus: TokenRedemptionStatus.STELLAR_FAILED,
      } as any);

      expect(res).toBe(updated);
      expect(prisma.vendorTokenRedemption.update).toHaveBeenCalledWith({
        where: { uuid: 'r-2' },
        data: {
          redemptionStatus: TokenRedemptionStatus.STELLAR_FAILED,
          approvedBy: undefined,
          approvedAt: expect.any(Date),
          transactionHash: undefined,
        },
        include: { vendor: true },
      });
    });
  });

  describe('list', () => {
    it('should list with filters and custom sort', async () => {
      const results = [
        { uuid: 'r-1', vendorUuid: 'v-1', vendor: {} },
        { uuid: 'r-2', vendorUuid: 'v-1', vendor: {} },
      ];
      prisma.vendorTokenRedemption.findMany.mockResolvedValue(results);

      const res = await service.list({
        vendorUuid: 'v-1',
        redemptionStatus: TokenRedemptionStatus.REQUESTED,
        page: 2,
        perPage: 5,
        sort: 'createdAt',
        order: 'asc',
        name: 'Shop',
      } as any);

      expect(prisma.vendorTokenRedemption.findMany).toHaveBeenCalledWith({
        where: {
          vendorUuid: 'v-1',
          redemptionStatus: TokenRedemptionStatus.REQUESTED,
          vendor: { name: { contains: 'Shop', mode: 'insensitive' } },
        },
        include: { vendor: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(res).toEqual({ data: results, total: 2, page: 2, perPage: 5 });
    });

    it('should use default sort desc and no filters when not provided', async () => {
      const results: any[] = [];
      prisma.vendorTokenRedemption.findMany.mockResolvedValue(results);

      const res = await service.list({} as any);

      expect(prisma.vendorTokenRedemption.findMany).toHaveBeenCalledWith({
        where: {},
        include: { vendor: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(res).toEqual({ data: results, total: 0, page: undefined, perPage: undefined });
    });

    it('should handle errors in list', async () => {
      prisma.vendorTokenRedemption.findMany.mockRejectedValue(
        new Error('paginate error')
      );
      await expect(service.list({} as any)).rejects.toHaveProperty(
        'message',
        'paginate error'
      );
    });

    it('should execute catch block when paginate throws synchronously', async () => {
      const original = prisma.vendorTokenRedemption.findMany;
      prisma.vendorTokenRedemption.findMany = jest.fn(() => {
        throw new Error('sync paginate error');
      });

      await expect(service.list({} as any)).rejects.toHaveProperty(
        'message',
        'sync paginate error'
      );

      // restore
      prisma.vendorTokenRedemption.findMany = original;
    });
  });

  describe('getVendorRedemptions', () => {
    it('should return vendor redemptions ordered by createdAt desc', async () => {
      const items = [{ uuid: 'r-1' }, { uuid: 'r-2' }];
      prisma.vendorTokenRedemption.findMany.mockResolvedValue(items);
      const res = await service.getVendorRedemptions({ vendorUuid: 'v-1' } as any);
      expect(res).toBe(items);
      expect(prisma.vendorTokenRedemption.findMany).toHaveBeenCalledWith({
        where: { vendorUuid: 'v-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle errors in getVendorRedemptions', async () => {
      prisma.vendorTokenRedemption.findMany.mockRejectedValue(
        new Error('findMany error')
      );
      await expect(
        service.getVendorRedemptions({ vendorUuid: 'v-1' } as any)
      ).rejects.toHaveProperty('message', 'findMany error');
    });
  });

  describe('getVendorTokenRedemptionStats', () => {
    it('should return totals for approved and pending', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ uuid: 'v-1' });
      prisma.vendorTokenRedemption.aggregate
        .mockResolvedValueOnce({ _sum: { tokenAmount: 100 } })
        .mockResolvedValueOnce({ _sum: { tokenAmount: 30 } });

      const res = await service.getVendorTokenRedemptionStats({
        vendorUuid: 'v-1',
      } as any);

      expect(res).toEqual({ totalTokensApproved: 100, totalTokensPending: 30 });
      expect(prisma.vendorTokenRedemption.aggregate).toHaveBeenNthCalledWith(
        1,
        {
          where: {
            vendorUuid: 'v-1',
            redemptionStatus: { in: [TokenRedemptionStatus.APPROVED] },
          },
          _sum: { tokenAmount: true },
        }
      );
      expect(prisma.vendorTokenRedemption.aggregate).toHaveBeenNthCalledWith(
        2,
        {
          where: {
            vendorUuid: 'v-1',
            redemptionStatus: {
              in: [
                TokenRedemptionStatus.REQUESTED,
                TokenRedemptionStatus.STELLAR_VERIFIED,
              ],
            },
          },
          _sum: { tokenAmount: true },
        }
      );
    });

    it('should coerce null sums to 0', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ uuid: 'v-1' });
      prisma.vendorTokenRedemption.aggregate
        .mockResolvedValueOnce({ _sum: { tokenAmount: null } })
        .mockResolvedValueOnce({ _sum: { tokenAmount: null } });

      const res = await service.getVendorTokenRedemptionStats({
        vendorUuid: 'v-1',
      } as any);

      expect(res).toEqual({ totalTokensApproved: 0, totalTokensPending: 0 });
    });

    it('should throw if vendor does not exist', async () => {
      prisma.vendor.findUnique.mockResolvedValue(null);
      await expect(
        service.getVendorTokenRedemptionStats({ vendorUuid: 'missing' } as any)
      ).rejects.toHaveProperty('message', 'Vendor with UUID missing not found');
    });

    it('should handle errors in aggregation', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ uuid: 'v-1' });
      prisma.vendorTokenRedemption.aggregate.mockRejectedValue(
        new Error('agg error')
      );
      await expect(
        service.getVendorTokenRedemptionStats({ vendorUuid: 'v-1' } as any)
      ).rejects.toHaveProperty('message', 'agg error');
    });
  });
});
