import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { getQueueToken } from '@nestjs/bull';
import { InkindsService } from './inkinds.service';
import {
  InkindType,
  InkindTxStatus,
  BeneficiaryInkindRedeemDto,
} from './dto/inkind.dto';
import { BQUEUE, CHAIN_SERVICE, CORE_MODULE } from '../constants';
import { of } from 'rxjs';
import { AppService } from '../app/app.service';
import { ConfigService } from '@nestjs/config';

describe('InkindsService - Inkind Redemption', () => {
  let service: InkindsService;
  let prismaService: PrismaService;
  let contractQueue: any;

  const mockContractQueue = {
    add: jest.fn(),
  };

  const mockCoreClient = {
    send: jest.fn().mockReturnValue(of(true)),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockTx = {
    vendor: {
      findFirst: jest.fn(),
    },
    inkind: {
      findMany: jest.fn(),
    },
    beneficiary: {
      findFirst: jest.fn(),
    },
    groupInkind: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    beneficiaryInkindRedemption: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
    },
    inkindStockMovement: {
      create: jest.fn(),
    },
    beneficiaryGroup: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    vendor: {
      findFirst: jest.fn(),
    },
    inkind: {
      findMany: jest.fn(),
    },
    beneficiary: {
      findFirst: jest.fn(),
    },
    groupInkind: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    beneficiaryInkindRedemption: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
    },
    inkindStockMovement: {
      create: jest.fn(),
    },
    beneficiaryGroup: {
      create: jest.fn(),
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
        {
          provide: getQueueToken(BQUEUE.CONTRACT),
          useValue: mockContractQueue,
        },
        {
          provide: AppService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              value: { active_year: 2026, river_basin: 'Koshi' },
            }),
          },
        },
        {
          provide: CORE_MODULE,
          useValue: mockCoreClient,
        },
        {
          provide: CHAIN_SERVICE,
          useValue: { redeemInkind: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-project-id') },
        },
      ],
    })
      .useMocker((token) => {
        if (token === 'Logger') {
          return mockLogger;
        }
        return {};
      })
      .compile();

    service = module.get<InkindsService>(InkindsService);
    prismaService = module.get<PrismaService>(PrismaService);
    contractQueue = module.get(getQueueToken(BQUEUE.CONTRACT));

    // Setup default mock implementations
    jest.clearAllMocks();
  });

  describe('beneficiaryInkindRedeem', () => {
    const walletAddress = '0x123456789abcdef';
    const beneficiaryUuid = 'beneficiary-uuid';
    const vendorUuid = 'vendor-uuid';
    const vendorWallet = '0xvendor123';

    const mockVendor = {
      uuid: vendorUuid,
      walletAddress: vendorWallet,
      name: 'Test Vendor',
    };

    const mockBeneficiary = {
      uuid: beneficiaryUuid,
      walletAddress,
      phone: '1234567890',
    };

    const mockInkind1 = {
      uuid: 'inkind-uuid-1',
      name: 'Food Voucher',
      type: InkindType.PRE_DEFINED,
      availableStock: 100,
      deletedAt: null,
    };

    const mockInkind2 = {
      uuid: 'inkind-uuid-2',
      name: 'Medicine Inkind',
      type: InkindType.WALK_IN,
      availableStock: 50,
      deletedAt: null,
    };

    const mockGroupInkind = {
      uuid: 'group-inkind-uuid',
      inkindId: 'inkind-uuid-1',
      groupId: 'group-uuid',
      quantityAllocated: 100,
      quantityRedeemed: 0,
      group: {
        uuid: 'group-uuid',
        name: 'Test Group',
        beneficiaries: [
          {
            beneficiaryId: beneficiaryUuid,
          },
        ],
        _count: {
          beneficiaries: 10,
        },
      },
      inkind: mockInkind1,
    };

    const redeemPayload: BeneficiaryInkindRedeemDto = {
      walletAddress,
      inkinds: [
        {
          uuid: 'inkind-uuid-1',
          groupInkindUuid: 'group-inkind-uuid',
        },
      ],
      user: {
        id: 1,
        userId: 1,
        uuid: vendorUuid,
        name: 'Test Vendor',
        email: 'vendor@test.com',
        phone: null,
        wallet: vendorWallet,
      },
    };

    it('should successfully redeem pre-defined inkinds for beneficiary', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockTx.beneficiaryToGroup.findMany.mockResolvedValue([
        { beneficiaryId: beneficiaryUuid, groupId: 'group-uuid' },
      ]);
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({
        uuid: 'redemption-uuid-1',
        quantity: 10,
        beneficiaryWallet: walletAddress,
      });

      mockContractQueue.add.mockResolvedValue({ id: 1 });

      const result = await service.beneficiaryInkindRedeem(redeemPayload);

      expect(result.message).toBe('Inkinds redeemed successfully');
      expect(result.redemptions).toBeDefined();
      expect(mockPrismaService.vendor.findFirst).toHaveBeenCalled();
    });

    it('should successfully redeem walk-in inkinds for beneficiary', async () => {
      const walkInPayload: BeneficiaryInkindRedeemDto = {
        walletAddress,
        inkinds: [
          {
            uuid: 'inkind-uuid-2',
          },
        ],
        user: {
          id: 1,
          userId: 1,
          uuid: vendorUuid,
          name: 'Test Vendor',
          email: 'vendor@test.com',
          phone: null,
          wallet: vendorWallet,
        },
      };

      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind2]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind2]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      // createGroupAndAssignBeneficiary calls this.client.send — return a group with uuid
      mockCoreClient.send.mockReturnValue(
        of({ group: { uuid: 'new-group-uuid' }, beneficiaries: [] })
      );

      mockTx.groupInkind.findMany.mockResolvedValue([]);
      mockTx.groupInkind.create.mockResolvedValue({ uuid: 'new-group-inkind-uuid' });
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({
        uuid: 'redemption-uuid-2',
        quantity: 1,
        beneficiaryWallet: walletAddress,
      });
      mockTx.inkindStockMovement.create.mockResolvedValue({ uuid: 'stock-uuid' });

      const result = await service.beneficiaryInkindRedeem(walkInPayload);

      expect(result.message).toBe('Inkinds redeemed successfully');
    });

    it('should throw error when vendor not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(null);

      await expect(
        service.beneficiaryInkindRedeem(redeemPayload)
      ).rejects.toThrow(RpcException);
      expect(mockPrismaService.vendor.findFirst).toHaveBeenCalledWith({
        where: {
          uuid: vendorUuid,
        },
      });
    });

    it('should throw error when beneficiary not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(null);

      await expect(
        service.beneficiaryInkindRedeem(redeemPayload)
      ).rejects.toThrow(RpcException);
    });

    it('should throw error when one or more inkinds not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([]);

      await expect(
        service.beneficiaryInkindRedeem(redeemPayload)
      ).rejects.toThrow(RpcException);
    });

    it('should throw error when beneficiary not member of group for pre-defined inkind', async () => {
      const groupInkindNoMember = {
        ...mockGroupInkind,
        group: {
          ...mockGroupInkind.group,
          beneficiaries: [],
        },
      };

      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(
        mockBeneficiary
      );

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([groupInkindNoMember]);

      await expect(
        service.beneficiaryInkindRedeem(redeemPayload)
      ).rejects.toThrow(RpcException);
    });

    it('should throw error when beneficiary has already redeemed pre-defined inkind', async () => {
      const existingRedemption = {
        uuid: 'existing-redemption-uuid',
        groupInkindId: 'group-inkind-uuid',
        beneficiaryWallet: walletAddress,
        groupInkind: {
          inkind: {
            name: 'Food Voucher',
          },
        },
      };

      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(
        mockBeneficiary
      );

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([
        existingRedemption,
      ]);

      await expect(
        service.beneficiaryInkindRedeem(redeemPayload)
      ).rejects.toThrow(RpcException);
    });

    it('should throw error when missing required fields', async () => {
      const invalidPayload = {
        walletAddress: '',
        inkinds: [],
        user: redeemPayload.user,
      };

      await expect(
        service.beneficiaryInkindRedeem(invalidPayload as any)
      ).rejects.toThrow(RpcException);
    });

    it('should throw error when groupInkindUuid missing for pre-defined inkind', async () => {
      const invalidPayload: BeneficiaryInkindRedeemDto = {
        walletAddress,
        inkinds: [
          {
            uuid: 'inkind-uuid-1',
            // groupInkindUuid is missing
          },
        ],
        user: redeemPayload.user,
      };

      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);

      await expect(
        service.beneficiaryInkindRedeem(invalidPayload)
      ).rejects.toThrow(RpcException);
    });

    it('should handle contract queue enqueue failure gracefully', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockPrismaService.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockPrismaService.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockTx.beneficiaryToGroup.findMany.mockResolvedValue([
        { beneficiaryId: beneficiaryUuid, groupId: 'group-uuid' },
      ]);
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({
        uuid: 'redemption-uuid-1',
        quantity: 10,
      });

      mockContractQueue.add.mockRejectedValue(new Error('Queue error'));

      const result = await service.beneficiaryInkindRedeem(redeemPayload);

      // Should still return success even if queue fails
      expect(result.message).toBe('Inkinds redeemed successfully');
      expect(result.redemptions).toBeDefined();
    });
  });

  describe('updateRedeemInkindTxHash', () => {
    const beneficiaryWallet = '0x123456789abcdef';
    const txHash = '0xtxhash123456789';
    const inkindUuids = ['inkind-uuid-1', 'inkind-uuid-2'];

    it('should successfully update redemption txHash', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue(
        {
          count: 2,
        }
      );

      const result = await service.updateRedeemInkindTxHash(
        inkindUuids,
        txHash,
        beneficiaryWallet
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Redemption txHash updated successfully');
      expect(
        mockPrismaService.beneficiaryInkindRedemption.updateMany
      ).toHaveBeenCalledWith({
        where: {
          beneficiaryWallet,
          groupInkind: {
            inkindId: { in: inkindUuids },
          },
        },
        data: { txHash, status: InkindTxStatus.COMPLETED },
      });
    });

    it('should throw RpcException on database error', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        service.updateRedeemInkindTxHash(inkindUuids, txHash, beneficiaryWallet)
      ).rejects.toThrow(RpcException);
    });

    it('should handle empty inkindUuids array', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue(
        {
          count: 0,
        }
      );

      const result = await service.updateRedeemInkindTxHash(
        [],
        txHash,
        beneficiaryWallet
      );

      expect(result.success).toBe(true);
      expect(
        mockPrismaService.beneficiaryInkindRedemption.updateMany
      ).toHaveBeenCalledWith({
        where: {
          beneficiaryWallet,
          groupInkind: {
            inkindId: { in: [] },
          },
        },
        data: { txHash, status: InkindTxStatus.COMPLETED },
      });
    });

    it('should update multiple redemptions for same beneficiary', async () => {
      const multipleUuids = [
        'inkind-uuid-1',
        'inkind-uuid-2',
        'inkind-uuid-3',
        'inkind-uuid-4',
      ];

      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue(
        {
          count: 4,
        }
      );

      const result = await service.updateRedeemInkindTxHash(
        multipleUuids,
        txHash,
        beneficiaryWallet
      );

      expect(result.success).toBe(true);
      expect(
        mockPrismaService.beneficiaryInkindRedemption.updateMany
      ).toHaveBeenCalledWith({
        where: {
          beneficiaryWallet,
          groupInkind: {
            inkindId: { in: multipleUuids },
          },
        },
        data: { txHash, status: InkindTxStatus.COMPLETED },
      });
    });

    it('should correctly format txHash parameter', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue(
        {
          count: 1,
        }
      );

      const testTxHash = '0x' + 'a'.repeat(64);
      await service.updateRedeemInkindTxHash(
        inkindUuids,
        testTxHash,
        beneficiaryWallet
      );

      expect(
        mockPrismaService.beneficiaryInkindRedemption.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            txHash: testTxHash,
          }),
        })
      );
    });

    it('should set status to COMPLETED', async () => {
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue(
        {
          count: 1,
        }
      );

      await service.updateRedeemInkindTxHash(
        inkindUuids,
        txHash,
        beneficiaryWallet
      );

      expect(
        mockPrismaService.beneficiaryInkindRedemption.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InkindTxStatus.COMPLETED,
          }),
        })
      );
    });
  });
});

// ─── Concurrent redemption: 2 vendors × 10 beneficiaries, shared inkind ───────

describe('InkindsService - concurrent inkind redemption (2 vendors, 10 beneficiaries each)', () => {
  let service: InkindsService;

  const BENEFICIARY_COUNT = 10;
  const inkindUuid = 'shared-inkind-uuid';
  const groupInkindUuid = 'shared-group-inkind-uuid';
  const groupUuid = 'shared-group-uuid';

  const vendor1 = { uuid: 'vendor-1', walletAddress: '0xVendor1', name: 'Vendor One' };
  const vendor2 = { uuid: 'vendor-2', walletAddress: '0xVendor2', name: 'Vendor Two' };

  const makeBen = (n: number, v: 1 | 2) => ({
    uuid: `ben-v${v}-${n}`,
    walletAddress: `0xBenV${v}_${n}`,
    phone: `${v}00000000${n}`,
  });

  const v1Bens = Array.from({ length: BENEFICIARY_COUNT }, (_, i) => makeBen(i, 1));
  const v2Bens = Array.from({ length: BENEFICIARY_COUNT }, (_, i) => makeBen(i, 2));
  const allBens = [...v1Bens, ...v2Bens];

  const sharedInkind = {
    uuid: inkindUuid,
    name: 'Food Voucher',
    type: InkindType.PRE_DEFINED,
    availableStock: 500,
    deletedAt: null,
  };

  const sharedGroupInkind = {
    uuid: groupInkindUuid,
    inkindId: inkindUuid,
    groupId: groupUuid,
    quantityAllocated: 200,
    quantityRedeemed: 0,
    group: {
      uuid: groupUuid,
      name: 'Shared Group',
      beneficiaries: allBens.map((b) => ({ beneficiaryId: b.uuid })),
      _count: { beneficiaries: allBens.length },
    },
    inkind: sharedInkind,
  };

  const makePayload = (
    vendor: typeof vendor1,
    ben: (typeof v1Bens)[0],
  ): BeneficiaryInkindRedeemDto => ({
    walletAddress: ben.walletAddress,
    inkinds: [{ uuid: inkindUuid, groupInkindUuid }],
    user: { id: 1, userId: 1, uuid: vendor.uuid, name: vendor.name, email: 'vendor@test.com', phone: null, wallet: vendor.walletAddress },
  });

  // ── Isolated mocks for this suite ──────────────────────────────────────────
  const mockChainService = { redeemInkind: jest.fn() };
  const mockAppService = { getSettings: jest.fn() };
  const mockClient = { send: jest.fn() };

  const mockTx = {
    groupInkind: { findMany: jest.fn() },
    beneficiaryInkindRedemption: { findMany: jest.fn(), create: jest.fn() },
    inkindStockMovement: { create: jest.fn() },
    beneficiaryGroup: { create: jest.fn() },
  };

  const mockPrisma = {
    vendor: { findFirst: jest.fn() },
    inkind: { findMany: jest.fn() },
    beneficiary: { findFirst: jest.fn() },
    groupInkind: { findMany: jest.fn(), findUnique: jest.fn() },
    beneficiaryInkindRedemption: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    inkindStockMovement: { create: jest.fn() },
    beneficiaryGroup: { create: jest.fn() },
    $transaction: jest.fn((cb) => cb(mockTx)),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InkindsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppService, useValue: mockAppService },
        { provide: CHAIN_SERVICE, useValue: mockChainService },
        { provide: CORE_MODULE, useValue: mockClient },
      ],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<InkindsService>(InkindsService);
  });

  // ── Shared setup: reset mocks and wire stateful DB simulation ──────────────
  beforeEach(() => {
    jest.clearAllMocks();

    mockAppService.getSettings.mockResolvedValue({
      value: { active_year: 2026, river_basin: 'Koshi' },
    });
    // Phase payout is active
    mockClient.send.mockReturnValue(of(true));
    mockChainService.redeemInkind.mockResolvedValue(undefined);

    mockPrisma.vendor.findFirst.mockImplementation(({ where }) => {
      if (where.uuid === vendor1.uuid) return Promise.resolve(vendor1);
      if (where.uuid === vendor2.uuid) return Promise.resolve(vendor2);
      return Promise.resolve(null);
    });

    mockPrisma.inkind.findMany.mockResolvedValue([sharedInkind]);

    mockPrisma.beneficiary.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(allBens.find((b) => b.walletAddress === where.walletAddress) ?? null),
    );

    // validatePreDefinedInkinds calls this.prisma.groupInkind.findMany (outside the transaction)
    mockPrisma.groupInkind.findMany.mockResolvedValue([sharedGroupInkind]);
    mockTx.groupInkind.findMany.mockResolvedValue([sharedGroupInkind]);
    mockTx.inkindStockMovement.create.mockResolvedValue({ uuid: 'stock-move' });

    // Stateful idempotency simulation shared by both prisma and tx duplicate checks.
    // validatePreDefinedInkinds calls this.prisma.beneficiaryInkindRedemption.findMany (outside tx),
    // so both mocks must see the same written state.
    const redeemedWallets = new Set<string>();
    let counter = 0;

    const alreadyRedeemedImpl = ({ where }: any) => {
      if (redeemedWallets.has(where.beneficiaryWallet)) {
        return Promise.resolve([
          {
            uuid: 'dup',
            groupInkindId: groupInkindUuid,
            beneficiaryWallet: where.beneficiaryWallet,
            groupInkind: { inkind: { name: sharedInkind.name } },
          },
        ]);
      }
      return Promise.resolve([]);
    };

    mockPrisma.beneficiaryInkindRedemption.findMany.mockImplementation(alreadyRedeemedImpl);
    mockTx.beneficiaryInkindRedemption.findMany.mockImplementation(alreadyRedeemedImpl);

    mockTx.beneficiaryInkindRedemption.create.mockImplementation(({ data }) => {
      redeemedWallets.add(data.beneficiaryWallet);
      return Promise.resolve({
        uuid: `redemption-${++counter}`,
        quantity: Math.floor(
          sharedGroupInkind.quantityAllocated / sharedGroupInkind.group._count.beneficiaries,
        ),
        beneficiaryWallet: data.beneficiaryWallet,
        vendorUid: data.vendorUid,
        groupInkindId: data.groupInkindId,
        status: InkindTxStatus.PENDING,
      });
    });
  });

  // ── Sequential: one vendor, one beneficiary at a time ──────────────────────

  it('vendor 1 — 10 beneficiaries processed sequentially creates 10 DB records and 10 chain jobs', async () => {
    for (const ben of v1Bens) {
      await service.beneficiaryInkindRedeem(makePayload(vendor1, ben));
    }

    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(BENEFICIARY_COUNT);
    expect(mockChainService.redeemInkind).toHaveBeenCalledTimes(BENEFICIARY_COUNT);

    const jobVendorAddresses = mockChainService.redeemInkind.mock.calls.map(
      ([dto]) => dto.vendorAddress,
    );
    expect(jobVendorAddresses.every((addr) => addr === vendor1.walletAddress)).toBe(true);
  });

  it('vendor 2 — 10 beneficiaries processed sequentially creates 10 DB records and 10 chain jobs', async () => {
    for (const ben of v2Bens) {
      await service.beneficiaryInkindRedeem(makePayload(vendor2, ben));
    }

    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(BENEFICIARY_COUNT);
    expect(mockChainService.redeemInkind).toHaveBeenCalledTimes(BENEFICIARY_COUNT);

    const jobVendorAddresses = mockChainService.redeemInkind.mock.calls.map(
      ([dto]) => dto.vendorAddress,
    );
    expect(jobVendorAddresses.every((addr) => addr === vendor2.walletAddress)).toBe(true);
  });

  // ── Concurrent: both vendors fire simultaneously ────────────────────────────

  it('both vendors process 10 beneficiaries each concurrently — 20 DB records, 20 chain jobs', async () => {
    const allPayloads = [
      ...v1Bens.map((b) => makePayload(vendor1, b)),
      ...v2Bens.map((b) => makePayload(vendor2, b)),
    ];

    const results = await Promise.all(allPayloads.map((p) => service.beneficiaryInkindRedeem(p)));

    expect(results).toHaveLength(20);
    results.forEach((r) => expect(r.message).toBe('Inkinds redeemed successfully'));
    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(20);
    expect(mockChainService.redeemInkind).toHaveBeenCalledTimes(20);
  });

  it('concurrent: each vendor is assigned exactly 10 chain jobs with the correct vendor address', async () => {
    const allPayloads = [
      ...v1Bens.map((b) => makePayload(vendor1, b)),
      ...v2Bens.map((b) => makePayload(vendor2, b)),
    ];

    await Promise.all(allPayloads.map((p) => service.beneficiaryInkindRedeem(p)));

    const redeemDtos = mockChainService.redeemInkind.mock.calls.map(([dto]) => dto);
    const v1Jobs = redeemDtos.filter((d) => d.vendorAddress === vendor1.walletAddress);
    const v2Jobs = redeemDtos.filter((d) => d.vendorAddress === vendor2.walletAddress);

    expect(v1Jobs).toHaveLength(BENEFICIARY_COUNT);
    expect(v2Jobs).toHaveLength(BENEFICIARY_COUNT);

    // Each job carries the matching beneficiary wallet
    expect(v1Jobs.map((d) => d.beneficiaryAddress)).toEqual(
      expect.arrayContaining(v1Bens.map((b) => b.walletAddress)),
    );
    expect(v2Jobs.map((d) => d.beneficiaryAddress)).toEqual(
      expect.arrayContaining(v2Bens.map((b) => b.walletAddress)),
    );
  });

  it('concurrent: no cross-vendor contamination in DB records', async () => {
    const allPayloads = [
      ...v1Bens.map((b) => makePayload(vendor1, b)),
      ...v2Bens.map((b) => makePayload(vendor2, b)),
    ];

    await Promise.all(allPayloads.map((p) => service.beneficiaryInkindRedeem(p)));

    const createArgs = mockTx.beneficiaryInkindRedemption.create.mock.calls.map(
      ([{ data }]) => data,
    );
    const v1Records = createArgs.filter((d) => d.vendorUid === vendor1.uuid);
    const v2Records = createArgs.filter((d) => d.vendorUid === vendor2.uuid);

    expect(v1Records).toHaveLength(BENEFICIARY_COUNT);
    expect(v2Records).toHaveLength(BENEFICIARY_COUNT);
    expect(v1Records.every((d) => d.vendorUid !== vendor2.uuid)).toBe(true);
    expect(v2Records.every((d) => d.vendorUid !== vendor1.uuid)).toBe(true);
  });

  it('concurrent: each chain job includes the correct inkind uuid', async () => {
    const allPayloads = [
      ...v1Bens.map((b) => makePayload(vendor1, b)),
      ...v2Bens.map((b) => makePayload(vendor2, b)),
    ];

    await Promise.all(allPayloads.map((p) => service.beneficiaryInkindRedeem(p)));

    const redeemDtos = mockChainService.redeemInkind.mock.calls.map(([dto]) => dto);
    expect(redeemDtos.every((d) => d.inkinds.includes(inkindUuid))).toBe(true);
  });

  // ── Race condition documentation ────────────────────────────────────────────

  it('documents the race condition: same beneficiary submitted concurrently bypasses app-level duplicate check', async () => {
    const sameBen = v1Bens[0];
    const payload = makePayload(vendor1, sameBen);

    // Both requests read "no existing redemption" before either writes — simulates concurrent DB reads
    mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);

    await Promise.all([
      service.beneficiaryInkindRedeem(payload),
      service.beneficiaryInkindRedeem(payload),
    ]);

    // Without a DB-level unique constraint on (beneficiaryWallet, groupInkindId),
    // both writes succeed — this is the known doubling bug
    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(2);
    expect(mockChainService.redeemInkind).toHaveBeenCalledTimes(2);
  });

  it('sequential duplicate: app-level check catches the second redemption of the same beneficiary', async () => {
    const sameBen = v1Bens[0];
    const payload = makePayload(vendor1, sameBen);

    await service.beneficiaryInkindRedeem(payload);
    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(1);

    // State mock now returns the record written above — sequential check works
    await expect(service.beneficiaryInkindRedeem(payload)).rejects.toThrow(RpcException);
    expect(mockTx.beneficiaryInkindRedemption.create).toHaveBeenCalledTimes(1);
  });
});
