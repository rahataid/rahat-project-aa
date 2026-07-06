import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { PrismaService } from '@rumsan/prisma';
import { GctTreasuryService } from './gct-treasury.service';
import { GctOfframpClient } from './gct-offramp.client';

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
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
};

const mockTreasuryService = {
  getBalance: jest.fn(),
  getTreasuryInfo: jest.fn(),
  transfer: jest.fn(),
};

const mockOfframpClient = {
  getOfframpWalletAddress: jest.fn(),
  instantOfframp: jest.fn(),
};

describe('GroupCashTransferService', () => {
  let service: GroupCashTransferService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupCashTransferService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GctTreasuryService, useValue: mockTreasuryService },
        { provide: GctOfframpClient, useValue: mockOfframpClient },
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

      const result = await service.assignFund({
        groupCashTransferId: MOCK_UUID,
        title: 'Test Fund',
        amount: 500,
        user: { name: 'Tester' } as any,
      });

      expect(mockPrisma.groupCashTransferRecord.create).toHaveBeenCalledWith({
        data: {
          groupCashTransferId: MOCK_UUID,
          title: 'Test Fund',
          amount: 500,
          status: 'NOT_STARTED',
          createdBy: 'Tester',
        },
      });
      expect(result.uuid).toBe(MOCK_RECORD_UUID);
    });

    it('throws if group not found', async () => {
      mockPrisma.groupCashTransferDetail.findFirst.mockResolvedValue(null);

      await expect(
        service.assignFund({
          groupCashTransferId: MOCK_UUID,
          title: 'Test Fund',
          amount: 500,
          user: { name: 'Tester' } as any,
        })
      ).rejects.toThrow(RpcException);
    });
  });

  // ──────────────── disburse ────────────────
  describe('disburse', () => {
    it('throws if record not found', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(null);

      await expect(service.disburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });

    it('throws if already completed', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue({
        ...mockFundRecord,
        status: 'COMPLETED',
      });

      await expect(service.disburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });

    it('is a no-op if a transfer was already initiated', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue({
        ...mockFundRecord,
        txHash: '0xabc',
        status: 'TOKEN_TRANSFERRED',
      });

      const result = await service.disburse(MOCK_RECORD_UUID);

      expect(mockTreasuryService.getBalance).not.toHaveBeenCalled();
      expect(result.txHash).toBe('0xabc');
    });

    it('throws if payoutProcessorId is not provided', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);

      await expect(service.disburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
      expect(mockTreasuryService.getBalance).not.toHaveBeenCalled();
    });

    it('blocks disbursement when the treasury balance is insufficient', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);
      mockTreasuryService.getBalance.mockResolvedValue(100);

      await expect(service.disburse(MOCK_RECORD_UUID, 'manual-bank-transfer')).rejects.toThrow(RpcException);
      expect(mockTreasuryService.transfer).not.toHaveBeenCalled();
      expect(mockPrisma.groupCashTransferRecord.update).not.toHaveBeenCalled();
    });

    it('transfers the token and marks the record TOKEN_TRANSFERRED', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);
      mockTreasuryService.getBalance.mockResolvedValue(1000);
      mockOfframpClient.getOfframpWalletAddress.mockResolvedValue('OFFRAMP_WALLET');
      mockTreasuryService.transfer.mockResolvedValue('0xtxhash');
      mockPrisma.groupCashTransferRecord.update.mockResolvedValue({});

      const result = await service.disburse(MOCK_RECORD_UUID, 'manual-bank-transfer');

      expect(mockTreasuryService.transfer).toHaveBeenCalledWith('OFFRAMP_WALLET', mockFundRecord.amount);
      expect(mockPrisma.groupCashTransferRecord.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_RECORD_UUID },
        data: { txHash: '0xtxhash', status: 'TOKEN_TRANSFERRED', payoutProcessorId: 'manual-bank-transfer' },
      });
      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xtxhash');
    });

    it('marks the record TOKEN_TRANSFER_FAILED and rethrows if the transfer fails', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);
      mockTreasuryService.getBalance.mockResolvedValue(1000);
      mockOfframpClient.getOfframpWalletAddress.mockResolvedValue('OFFRAMP_WALLET');
      mockTreasuryService.transfer.mockRejectedValue(new Error('chain down'));
      mockPrisma.groupCashTransferRecord.update.mockResolvedValue({});

      await expect(service.disburse(MOCK_RECORD_UUID, 'manual-bank-transfer')).rejects.toThrow(RpcException);
      expect(mockPrisma.groupCashTransferRecord.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_RECORD_UUID },
        data: { status: 'TOKEN_TRANSFER_FAILED', disbursementInfo: { error: 'chain down' } },
      });
    });
  });

  // ──────────────── confirmDisburse ────────────────
  describe('confirmDisburse', () => {
    const transferredRecord = {
      ...mockFundRecord,
      txHash: '0xtxhash',
      status: 'TOKEN_TRANSFERRED',
      payoutProcessorId: 'manual-bank-transfer',
      groupCashTransfer: {
        ...mockDetail,
        bankDetails: { bankName: 'Nabil Bank Ltd.', accountNumber: '123', accountName: 'Test Group' },
      },
    };

    it('throws if record not found', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(null);

      await expect(service.confirmDisburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });

    it('throws if already completed', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue({
        ...transferredRecord,
        status: 'COMPLETED',
      });

      await expect(service.confirmDisburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });

    it('throws if the transfer has not been initiated yet', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(mockFundRecord);

      await expect(service.confirmDisburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
    });

    it('throws if payoutProcessorId was never set', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue({
        ...transferredRecord,
        payoutProcessorId: null,
      });

      await expect(service.confirmDisburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
      expect(mockOfframpClient.instantOfframp).not.toHaveBeenCalled();
    });

    it('completes the disbursement on a successful offramp call', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(transferredRecord);
      mockOfframpClient.instantOfframp.mockResolvedValue({ id: 'offramp-1' });
      mockPrisma.groupCashTransferRecord.update.mockResolvedValue({});

      const result = await service.confirmDisburse(MOCK_RECORD_UUID);

      expect(mockOfframpClient.instantOfframp).toHaveBeenCalledWith(
        expect.objectContaining({ paymentProviderId: 'manual-bank-transfer' })
      );
      expect(mockPrisma.groupCashTransferRecord.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_RECORD_UUID },
        data: {
          status: 'COMPLETED',
          disbursedAt: expect.any(Date),
          disbursementInfo: { result: { id: 'offramp-1' } },
        },
      });
      expect(result.success).toBe(true);
    });

    it('marks OFFRAMP_FAILED and rethrows when the offramp call fails, and can be retried', async () => {
      mockPrisma.groupCashTransferRecord.findFirst.mockResolvedValue(transferredRecord);
      mockOfframpClient.instantOfframp.mockRejectedValueOnce(new Error('provider down'));
      mockPrisma.groupCashTransferRecord.update.mockResolvedValue({});

      await expect(service.confirmDisburse(MOCK_RECORD_UUID)).rejects.toThrow(RpcException);
      expect(mockPrisma.groupCashTransferRecord.update).toHaveBeenCalledWith({
        where: { uuid: MOCK_RECORD_UUID },
        data: { status: 'OFFRAMP_FAILED', disbursementInfo: { error: 'provider down' } },
      });

      // retry: same txHash, offramp succeeds this time
      mockOfframpClient.instantOfframp.mockResolvedValueOnce({ id: 'offramp-2' });
      const result = await service.confirmDisburse(MOCK_RECORD_UUID);
      expect(result.success).toBe(true);
    });
  });

  // ──────────────── getTreasuryInfo ────────────────
  describe('getTreasuryInfo', () => {
    it('delegates to GctTreasuryService', async () => {
      mockTreasuryService.getTreasuryInfo.mockResolvedValue({
        publicKey: 'G123',
        balance: 1000,
        chainType: 'stellar',
        asset: { assetCode: 'RAHAT', assetIssuer: 'GISSUER' },
      });

      const result = await service.getTreasuryInfo();

      expect(result.publicKey).toBe('G123');
      expect(result.balance).toBe(1000);
    });
  });

  // ──────────────── getGCTData ────────────────
  describe('getGCTData', () => {
    it('includes treasury balance and remaining budget', async () => {
      mockPrisma.groupCashTransferDetail.count.mockResolvedValue(1);
      mockPrisma.groupCashTransferRecord.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 500 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });
      mockPrisma.groupCashTransferRecord.count.mockResolvedValue(0);
      mockPrisma.groupCashTransferRecord.groupBy.mockResolvedValue([
        { status: 'NOT_STARTED', _count: { _all: 1 } },
      ]);
      mockTreasuryService.getBalance.mockResolvedValue(1000);

      const result = await service.getGCTData();

      expect(result.totalAllocatedAmount).toBe(500);
      expect(result.treasuryBalance).toBe(1000);
      expect(result.remainingBudget).toBe(500);
    });
  });
});
