import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { PrismaService } from '@rumsan/prisma';

const MOCK_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MOCK_RECORD_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockDetail = {
  uuid: MOCK_UUID,
  name: 'Test Group',
  phone: '9800000000',
  bankDetails: null,
  extras: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockFundRecord = {
  uuid: MOCK_RECORD_UUID,
  groupCashTransferId: MOCK_UUID,
  amount: 500,
  status: 'NOT_STARTED',
  payoutProcessorId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockPrisma = {
  groupCashTransferDetail: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  groupCashTransferRecord: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

describe('GroupCashTransferService', () => {
  let service: GroupCashTransferService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupCashTransferService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GroupCashTransferService>(GroupCashTransferService);
  });

  // ──────────────── create ────────────────
  describe('create', () => {
    it('creates a new group cash transfer', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);
      mockPrisma.groupCashTransferDetail.create.mockResolvedValue(mockDetail);

      const result = await service.create({ name: 'Test Group', phone: '9800000000' });

      expect(mockPrisma.groupCashTransferDetail.findFirst).toHaveBeenCalledWith({
        where: { name: 'Test Group', deletedAt: null },
      });
      expect(result).toEqual(mockDetail);
    });

    it('throws if name already exists', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(mockDetail);

      await expect(service.create({ name: 'Test Group' })).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── update ────────────────
  describe('update', () => {
    it('updates an existing group cash transfer', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(mockDetail);
      mockPrisma.groupCashTransferDetail.update.mockResolvedValue({
        ...mockDetail,
        name: 'Updated Group',
      });

      const result = await service.update({ uuid: MOCK_UUID, name: 'Updated Group' });

      expect(mockPrisma.groupCashTransferDetail.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_UUID },
        data: { name: 'Updated Group' },
      });
      expect(result.name).toBe('Updated Group');
    });

    it('throws if group not found', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);

      await expect(service.update({ uuid: MOCK_UUID, name: 'X' })).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── delete ────────────────
  describe('delete', () => {
    it('soft deletes a group with no funds assigned', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(mockDetail);
      mockPrisma.groupCashTransferRecord.count.mockResolvedValue(0);
      mockPrisma.groupCashTransferDetail.update.mockResolvedValue({});

      const result = await service.delete(MOCK_UUID);

      expect(result.success).toBe(true);
      expect(mockPrisma.groupCashTransferDetail.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_UUID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws if fund is already assigned', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(mockDetail);
      mockPrisma.groupCashTransferRecord.count.mockResolvedValue(1);

      await expect(service.delete(MOCK_UUID)).rejects.toThrow(RpcException);
    });

    it('throws if group not found', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);

      await expect(service.delete(MOCK_UUID)).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── get ────────────────
  describe('get', () => {
    it('returns paginated results with totalAssignedAmount', async () => {
      const detailWithRecords = {
        ...mockDetail,
        groupCashTransferRecords: [{ uuid: MOCK_RECORD_UUID, amount: 500, status: 'NOT_STARTED', payoutProcessorId: null }],
      };

      mockPrisma.groupCashTransferDetail.findMany.mockResolvedValue([detailWithRecords]);
      mockPrisma.groupCashTransferDetail.count.mockResolvedValue(1);

      const result = await service.get({ page: 1, perPage: 10 });

      expect((result.data[0] as any).totalAssignedAmount).toBe(500);
    });

    it('applies hasFund=true filter', async () => {
      mockPrisma.groupCashTransferDetail.findMany.mockResolvedValue([]);
      mockPrisma.groupCashTransferDetail.count.mockResolvedValue(0);

      await service.get({ hasFund: true });

      const whereArg = mockPrisma.groupCashTransferDetail.findMany.mock.calls[0][0].where;
      expect(whereArg.groupCashTransferRecords).toEqual({ some: { deletedAt: null } });
    });

    it('applies hasFund=false filter', async () => {
      mockPrisma.groupCashTransferDetail.findMany.mockResolvedValue([]);
      mockPrisma.groupCashTransferDetail.count.mockResolvedValue(0);

      await service.get({ hasFund: false });

      const whereArg = mockPrisma.groupCashTransferDetail.findMany.mock.calls[0][0].where;
      expect(whereArg.groupCashTransferRecords).toEqual({ none: { deletedAt: null } });
    });

    it('applies search filter', async () => {
      mockPrisma.groupCashTransferDetail.findMany.mockResolvedValue([]);
      mockPrisma.groupCashTransferDetail.count.mockResolvedValue(0);

      await service.get({ search: 'abc' });

      const whereArg = mockPrisma.groupCashTransferDetail.findMany.mock.calls[0][0].where;
      expect(whereArg.OR).toBeDefined();
    });
  });

  // ──────────────── getOne ────────────────
  describe('getOne', () => {
    it('returns detail with totalAmount and totalRecords', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue({
        ...mockDetail,
        groupCashTransferRecords: [
          { uuid: MOCK_RECORD_UUID, amount: 300, status: 'NOT_STARTED', payoutProcessorId: null, createdAt: new Date(), updatedAt: new Date() },
          { uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc', amount: 200, status: 'PENDING', payoutProcessorId: null, createdAt: new Date(), updatedAt: new Date() },
        ],
      });

      const result = await service.getOne(MOCK_UUID);

      expect(result.totalAmount).toBe(500);
      expect(result.totalRecords).toBe(2);
    });

    it('throws if not found', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);

      await expect(service.getOne(MOCK_UUID)).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── assignFund ────────────────
  describe('assignFund', () => {
    it('creates a fund record', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(mockDetail);
      mockPrisma.groupCashTransferRecord.create.mockResolvedValue(mockFundRecord);

      const result = await service.assignFund({ groupCashTransferId: MOCK_UUID, amount: 500 });

      expect(mockPrisma.groupCashTransferRecord.create).toHaveBeenCalledWith({
        data: { groupCashTransferId: MOCK_UUID, amount: 500, status: 'NOT_STARTED' },
      });
      expect(result.uuid).toBe(MOCK_RECORD_UUID);
    });

    it('throws if group not found', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);

      await expect(
        service.assignFund({ groupCashTransferId: MOCK_UUID, amount: 500 })
      ).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── disburse ────────────────
  describe('disburse', () => {
    it('sets status to PENDING and returns success', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);
      mockPrisma.groupCashTransferRecord.update.mockResolvedValue({
        ...mockFundRecord,
        status: 'PENDING',
      });

      const result = await service.disburse(MOCK_RECORD_UUID);

      expect(mockPrisma.groupCashTransferRecord.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_RECORD_UUID },
        data: { status: 'PENDING' },
      });
      expect(result.success).toBe(true);
      expect(result.recordUuid).toBe(MOCK_RECORD_UUID);
    });

    it('throws if record not found', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(null);

      await expect(service.disburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });
  });
});
