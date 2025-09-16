import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '@rumsan/prisma';
import { VendorsService } from '../vendors/vendors.service';
import { OfframpService } from './offramp.service';
import { StellarService } from '../stellar/stellar.service';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { AppService } from '../app/app.service';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE, EVENTS } from '../constants';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { ListPayoutDto } from './dto/list-payout.dto';
import {
  PayoutType,
  PayoutMode,
  PayoutTransactionStatus,
} from '@prisma/client';
import { of } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prismaService: PrismaService;
  let vendorsService: VendorsService;
  let offrampService: OfframpService;
  let stellarService: StellarService;
  let beneficiaryService: BeneficiaryService;
  let appService: AppService;
  let clientProxy: ClientProxy;
  let stellarQueue: Queue;

  const mockPrismaService = {
    beneficiaryRedeem: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    payouts: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    beneficiaryGroupTokens: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    beneficiaryGroups: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
    },
    beneficiary: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    vendor: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockVendorsService = {
    findOne: jest.fn(),
    getVendorBeneficiaries: jest.fn(),
  };

  const mockOfframpService = {
    getPaymentProvider: jest.fn(),
    addBulkToOfframpQueue: jest.fn(),
    addToOfframpQueue: jest.fn(),
    instantOfframp: jest.fn(),
    getOfframpWalletAddress: jest.fn(),
  };

  const mockStellarService = {
    addToTokenTransferQueue: jest.fn(),
    getBeneficiaryTokenBalance: jest.fn(),
    addBulkToTokenTransferQueue: jest.fn(),
    disburse: jest.fn(),
    sendAssetToVendorByWalletAddress: jest.fn(),
  };

  const mockBeneficiaryService = {
    getOneGroup: jest.fn(),
    updateBeneficiaryRedeem: jest.fn(),
    updateBeneficiaryRedeemBulk: jest.fn(),
    createBeneficiaryRedeem: jest.fn(),
    getBeneficiaryRedeem: jest.fn(),
    findOneBeneficiaryByWalletAddress: jest.fn(),
    getFailedBeneficiaryRedeemByPayoutUUID: jest.fn(),
  };

  const mockAppService = {
    getSettings: jest.fn(),
  };

  const mockClientProxy = {
    send: jest.fn(),
    emit: jest.fn(),
  };

  const mockStellarQueue = {
    add: jest.fn(),
    addBulk: jest.fn(),
  };
  const mockEventEmitter = {
    emit: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'PROJECT_ID') return 'mock-project-id';
      return null;
    }),
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: VendorsService,
          useValue: mockVendorsService,
        },
        {
          provide: OfframpService,
          useValue: mockOfframpService,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: BeneficiaryService,
          useValue: mockBeneficiaryService,
        },
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: CORE_MODULE,
          useValue: mockClientProxy,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR),
          useValue: mockStellarQueue,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();
    let eventEmitter: EventEmitter2;
    service = module.get<PayoutsService>(PayoutsService);
    prismaService = module.get<PrismaService>(PrismaService);
    vendorsService = module.get<VendorsService>(VendorsService);
    offrampService = module.get<OfframpService>(OfframpService);
    stellarService = module.get<StellarService>(StellarService);
    beneficiaryService = module.get<BeneficiaryService>(BeneficiaryService);
    appService = module.get<AppService>(AppService);
    clientProxy = module.get<ClientProxy>(CORE_MODULE);
    stellarQueue = module.get<Queue>(getQueueToken(BQUEUE.STELLAR));
    eventEmitter = module.get(EventEmitter2);
    mockAppService.getSettings.mockResolvedValue({
      value: { project_name: 'Test Project' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPayoutStats', () => {
    it('should return payout statistics successfully', async () => {
      const mockBeneficiaryRedeems = [
        { beneficiaryWalletAddress: 'wallet1', amount: 100 },
        { beneficiaryWalletAddress: 'wallet2', amount: 200 },
        { beneficiaryWalletAddress: 'wallet1', amount: 50 }, // duplicate wallet
      ];

      mockPrismaService.beneficiaryRedeem.count
        .mockResolvedValueOnce(10) // fspCount
        .mockResolvedValueOnce(5) // vendorCount
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(15); // success

      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockBeneficiaryRedeems
      );

      const result = await service.getPayoutStats();

      expect(result).toEqual({
        payoutOverview: {
          payoutTypes: {
            FSP: 10,
            VENDOR: 5,
          },
          payoutStatus: {
            SUCCESS: 15,
            FAILED: 2,
          },
        },
        payoutStats: {
          beneficiaries: 2, // unique wallets
          totalCashDistribution: 350, // total amount
        },
      });

      expect(mockPrismaService.beneficiaryRedeem.count).toHaveBeenCalledTimes(
        4
      );
    });

    it('should handle errors in getPayoutStats', async () => {
      const error = new Error('Database error');
      mockPrismaService.beneficiaryRedeem.count.mockRejectedValue(error);

      await expect(service.getPayoutStats()).rejects.toThrow(
        'Failed to fetch payout stats'
      );
    });
  });

  describe('create', () => {
    const mockCreatePayoutDto: CreatePayoutDto = {
      groupId: 'group-uuid-123',
      type: PayoutType.FSP,
      mode: PayoutMode.ONLINE,
      payoutProcessorId: 'processor-123',
      status: 'PENDING',
      user: { name: 'Admin User' },
    };

    it('should create FSP payout successfully', async () => {
      const mockBeneficiaryGroup = {
        uuid: 'group-uuid-123',
        numberOfTokens: 1000,
        beneficiaryGroup: {
          name: 'Test Group',
          beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
        },
      };

      const mockCreatedPayout = {
        uuid: 'payout-uuid-123',
        type: PayoutType.FSP,
        mode: PayoutMode.ONLINE,
        payoutProcessorId: 'processor-123',
      };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);
      mockPrismaService.payouts.create.mockResolvedValue(mockCreatedPayout);

      const result = await service.create(mockCreatePayoutDto);

      expect(result).toEqual(mockCreatedPayout);
      expect(
        mockPrismaService.beneficiaryGroupTokens.findFirst
      ).toHaveBeenCalledWith({
        where: { uuid: 'group-uuid-123' },
        include: {
          beneficiaryGroup: {
            include: {
              beneficiaries: true,
            },
          },
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.NOTIFICATION.CREATE,
        expect.objectContaining({
          payload: expect.objectContaining({
            title: 'Payout Created',
            group: 'Payout',
            description: expect.stringContaining('Test Project'),
          }),
        })
      );
    });

    it('should throw error when beneficiary group not found', async () => {
      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        null
      );

      await expect(service.create(mockCreatePayoutDto)).rejects.toThrow(
        `Beneficiary group tokens with UUID 'group-uuid-123' not found`
      );
    });

    it('should throw error when payout already exists', async () => {
      const mockBeneficiaryGroup = { uuid: 'group-uuid-123' };
      const mockExistingPayout = { uuid: 'existing-payout' };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(mockExistingPayout);

      await expect(service.create(mockCreatePayoutDto)).rejects.toThrow(
        `Payout with groupId 'group-uuid-123' already exists`
      );
    });

    it('should throw error when FSP payout missing processor ID', async () => {
      const payloadWithoutProcessor = {
        ...mockCreatePayoutDto,
        payoutProcessorId: undefined,
      };
      const mockBeneficiaryGroup = { uuid: 'group-uuid-123' };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);

      await expect(service.create(payloadWithoutProcessor)).rejects.toThrow(
        'Payout processor ID is required for FSP payout'
      );
    });

    it('should create VENDOR OFFLINE payout successfully', async () => {
      const vendorPayoutDto = {
        ...mockCreatePayoutDto,
        type: PayoutType.VENDOR,
        mode: PayoutMode.OFFLINE,
        payoutProcessorId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const mockBeneficiaryGroup = {
        uuid: 'group-uuid-123',
        numberOfTokens: 1000,
        beneficiaryGroup: {
          name: 'Test Group',
          beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
        },
      };
      const mockVendor = {
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Vendor',
      };
      const mockCreatedPayout = {
        uuid: 'payout-uuid-123',
        type: PayoutType.VENDOR,
      };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);
      mockVendorsService.findOne.mockResolvedValue(mockVendor);
      mockPrismaService.payouts.create.mockResolvedValue(mockCreatedPayout);

      const result = await service.create(vendorPayoutDto);

      expect(result).toEqual(mockCreatedPayout);
      expect(mockVendorsService.findOne).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.NOTIFICATION.CREATE,
        expect.objectContaining({
          payload: expect.objectContaining({
            title: 'Payout Created',
            group: 'Payout',
            description: expect.stringContaining('Test Project'),
          }),
        })
      );
    });

    it('should throw error when VENDOR OFFLINE payout missing processor ID', async () => {
      const vendorPayoutDto = {
        ...mockCreatePayoutDto,
        type: PayoutType.VENDOR,
        mode: PayoutMode.OFFLINE,
        payoutProcessorId: undefined,
      };

      const mockBeneficiaryGroup = { uuid: 'group-uuid-123' };
      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);

      await expect(service.create(vendorPayoutDto)).rejects.toThrow(
        'Payout processor ID is required for OFFLINE payout'
      );
    });

    it('should throw error when vendor not found for OFFLINE payout', async () => {
      const vendorPayoutDto = {
        ...mockCreatePayoutDto,
        type: PayoutType.VENDOR,
        mode: PayoutMode.OFFLINE,
        payoutProcessorId: '123e4567-e89b-12d3-a456-426614174001',
      };

      const mockBeneficiaryGroup = { uuid: 'group-uuid-123' };
      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);
      mockVendorsService.findOne.mockResolvedValue(null);

      await expect(service.create(vendorPayoutDto)).rejects.toThrow(
        "Vendor with ID '123e4567-e89b-12d3-a456-426614174001' not found"
      );
    });

    it('should throw error when processor ID is not a valid UUID for OFFLINE payout', async () => {
      const vendorPayoutDto = {
        ...mockCreatePayoutDto,
        type: PayoutType.VENDOR,
        mode: PayoutMode.OFFLINE,
        payoutProcessorId: 'invalid-uuid',
      };

      const mockBeneficiaryGroup = { uuid: 'group-uuid-123' };
      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);

      await expect(service.create(vendorPayoutDto)).rejects.toThrow(
        'Payout processor ID is not a valid UUID'
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated payouts successfully', async () => {
      const mockListPayoutDto: ListPayoutDto = {
        page: 1,
        perPage: 10,
        payoutType: 'FSP',
        groupName: 'test-group',
      };

      const mockPayouts = [
        {
          uuid: 'payout-1',
          type: PayoutType.FSP,
          status: 'PENDING',
          beneficiaryGroupToken: {
            numberOfTokens: 1000,
            groupId: 'group-1',
            beneficiaryGroup: {
              _count: {
                beneficiaries: 10,
              },
            },
          },
          beneficiaryRedeem: [], // Add this to prevent the utility function error
        },
      ];

      Object.assign(mockPrismaService.payouts, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(mockPayouts),
      });

      // Mock the group processing
      mockBeneficiaryService.getOneGroup.mockResolvedValue({
        groupedBeneficiaries: [{ beneficiaryId: 'ben-1' }],
      });

      const result = await service.findAll(mockListPayoutDto);

      expect(result.data).toBeDefined();
      expect(mockPrismaService.payouts.findMany).toHaveBeenCalled();
    });

    it('should handle payout type filtering', async () => {
      const mockListPayoutDto: ListPayoutDto = {
        page: 1,
        perPage: 10,
        payoutType: 'FSP',
      };

      Object.assign(mockPrismaService.payouts, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(mockListPayoutDto);

      expect(mockPrismaService.payouts.findMany).toHaveBeenCalled();
    });

    it('should handle group name filtering', async () => {
      const mockListPayoutDto: ListPayoutDto = {
        page: 1,
        perPage: 10,
        groupName: 'test-group',
      };

      Object.assign(mockPrismaService.payouts, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(mockListPayoutDto);

      expect(mockPrismaService.payouts.findMany).toHaveBeenCalled();
    });
  });

  describe('calculatePayoutCompletionGap', () => {
    it('should calculate payout completion gap successfully', async () => {
      const mockProjectInfo = {
        value: { activatedAt: '2024-01-01T00:00:00Z' },
      };

      const mockPayoutLastLog = {
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      };

      mockAppService.getSettings.mockResolvedValue(mockProjectInfo);
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(
        mockPayoutLastLog
      );

      const result = await service.calculatePayoutCompletionGap('payout-123');

      expect(result).toBeDefined();
      expect(mockAppService.getSettings).toHaveBeenCalledWith({
        name: 'PROJECTINFO',
      });
    });

    it('should handle missing project info', async () => {
      mockAppService.getSettings.mockResolvedValue(null);

      await expect(
        service.calculatePayoutCompletionGap('payout-123')
      ).rejects.toThrow('Project info not found, in SETTINGS');
    });
  });

  describe('findOne', () => {
    it('should return payout with details successfully', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: PayoutType.FSP,
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 1000,
        },
        beneficiaryRedeem: [], // Add this to prevent the utility function error
      };

      const mockGroup = {
        groupedBeneficiaries: [
          { beneficiaryId: 'ben-1' },
          { beneficiaryId: 'ben-2' },
        ],
      };

      const mockRedeemDetails = [
        {
          beneficiaryWalletAddress: 'wallet-1',
          status: 'COMPLETED',
          amount: 500,
        },
      ];

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getOneGroup.mockResolvedValue(mockGroup);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeemDetails
      );
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.findOne('payout-123');

      expect(result).toBeDefined();
      expect(result.uuid).toBe('payout-123');
      expect(mockPrismaService.payouts.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'payout-123' },
        include: expect.any(Object),
      });
    });

    it('should throw error when payout not found in findOne', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        "Payout with UUID 'non-existent' not found"
      );
    });
  });

  describe('getOne', () => {
    it('should return simplified payout data successfully', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: PayoutType.FSP,
        status: 'PENDING',
        beneficiaryGroupToken: {
          numberOfTokens: 1000,
          title: 'Test Group',
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
          },
        },
        beneficiaryRedeem: [], // Add this to prevent the utility function error
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.getOne('payout-123');

      expect(result).toBeDefined();
      expect(result.uuid).toBe('payout-123');
      expect(mockPrismaService.payouts.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'payout-123' },
        include: expect.any(Object),
      });
    });

    it('should throw error when payout not found in getOne', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue(null);

      await expect(service.getOne('non-existent')).rejects.toThrow(
        "Payout with UUID 'non-existent' not found"
      );
    });
  });

  describe('update', () => {
    it('should update payout successfully', async () => {
      const updateDto: UpdatePayoutDto = {
        status: 'COMPLETED',
        extras: { note: 'Payout completed' },
      };

      const mockExistingPayout = {
        uuid: 'payout-123',
        status: 'PENDING',
        extras: {},
      };

      const mockUpdatedPayout = {
        uuid: 'payout-123',
        status: 'COMPLETED',
        extras: { note: 'Payout completed' },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(
        mockExistingPayout
      );
      mockPrismaService.payouts.update.mockResolvedValue(mockUpdatedPayout);

      const result = await service.update('payout-123', updateDto);

      expect(result).toEqual(mockUpdatedPayout);
      expect(mockPrismaService.payouts.update).toHaveBeenCalledWith({
        where: { uuid: 'payout-123' },
        data: updateDto,
      });
    });
  });

  describe('getPaymentProvider', () => {
    it('should return payment providers', async () => {
      const mockProviders = [
        { id: '1', name: 'Provider 1', type: 'bank' },
        { id: '2', name: 'Provider 2', type: 'mobile' },
      ];

      mockOfframpService.getPaymentProvider.mockResolvedValue(mockProviders);

      const result = await service.getPaymentProvider();

      expect(result).toEqual(mockProviders);
      expect(mockOfframpService.getPaymentProvider).toHaveBeenCalled();
    });
  });
});
