import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { getQueueToken } from '@nestjs/bull';
import { InkindsService } from './inkinds.service';
import { InkindType, InkindTxStatus, InkindStockMovementType } from '@prisma/client';
import { BeneficiaryInkindRedeemDto } from './dto/beneficiaryInkindRedeem.dto';
import { BQUEUE, JOBS } from '../constants';

describe('InkindsService - Inkind Redemption', () => {
  let service: InkindsService;
  let prismaService: PrismaService;
  let contractQueue: any;

  const mockContractQueue = {
    add: jest.fn(),
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
        uuid: vendorUuid,
        name: 'Test Vendor',
        wallet: vendorWallet,
      },
    };

    it('should successfully redeem pre-defined inkinds for beneficiary', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);

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
      expect(mockVendor.findFirst).not.toHaveBeenCalled();
      expect(mockContractQueue.add).toHaveBeenCalledWith(
        JOBS.EVM.REDEEM_INKIND,
        expect.objectContaining({
          beneficiaryAddress: walletAddress,
          vendorAddress: vendorWallet,
          inkinds: ['inkind-uuid-1'],
        }),
        expect.any(Object)
      );
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
          uuid: vendorUuid,
          name: 'Test Vendor',
          wallet: vendorWallet,
        },
      };

      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind2]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind2]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([]);
      mockTx.beneficiaryInkindRedemption.create.mockResolvedValue({
        uuid: 'redemption-uuid-2',
        quantity: 1,
        beneficiaryWallet: walletAddress,
      });
      mockTx.beneficiaryGroup.create.mockResolvedValue({
        uuid: 'new-group-uuid',
        name: 'Walk-in Group - Medicine Inkind',
      });

      mockContractQueue.add.mockResolvedValue({ id: 2 });

      const result = await service.beneficiaryInkindRedeem(walkInPayload);

      expect(result.message).toBe('Inkinds redeemed successfully');
      expect(mockContractQueue.add).toHaveBeenCalled();
    });

    it('should throw error when vendor not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(null);

      await expect(service.beneficiaryInkindRedeem(redeemPayload)).rejects.toThrow(
        RpcException
      );
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

      await expect(service.beneficiaryInkindRedeem(redeemPayload)).rejects.toThrow(
        RpcException
      );
    });

    it('should throw error when one or more inkinds not found', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([]);

      await expect(service.beneficiaryInkindRedeem(redeemPayload)).rejects.toThrow(
        RpcException
      );
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
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([groupInkindNoMember]);

      await expect(service.beneficiaryInkindRedeem(redeemPayload)).rejects.toThrow(
        RpcException
      );
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
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);

      mockTx.vendor.findFirst.mockResolvedValue(mockVendor);
      mockTx.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockTx.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);
      mockTx.groupInkind.findMany.mockResolvedValue([mockGroupInkind]);
      mockTx.beneficiaryInkindRedemption.findMany.mockResolvedValue([
        existingRedemption,
      ]);

      await expect(service.beneficiaryInkindRedeem(redeemPayload)).rejects.toThrow(
        RpcException
      );
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

      await expect(service.beneficiaryInkindRedeem(invalidPayload)).rejects.toThrow(
        RpcException
      );
    });

    it('should handle contract queue enqueue failure gracefully', async () => {
      mockPrismaService.vendor.findFirst.mockResolvedValue(mockVendor);
      mockPrismaService.inkind.findMany.mockResolvedValue([mockInkind1]);
      mockPrismaService.beneficiary.findFirst.mockResolvedValue(mockBeneficiary);

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
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({
        count: 2,
      });

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
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({
        count: 0,
      });

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

      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({
        count: 4,
      });

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
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({
        count: 1,
      });

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
      mockPrismaService.beneficiaryInkindRedemption.updateMany.mockResolvedValue({
        count: 1,
      });

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
