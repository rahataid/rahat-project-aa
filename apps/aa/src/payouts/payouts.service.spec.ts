import { Test, TestingModule } from '@nestjs/testing';
import { ONE_TOKEN_VALUE, PayoutsService } from './payouts.service';
import { paginator, PaginatorTypes, PrismaService } from '@rumsan/prisma';
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
import { SettingsService } from '@rumsan/settings';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prismaService: PrismaService;
  let vendorsService: VendorsService;
  let offrampService: OfframpService;
  let stellarService: StellarService;
  let beneficiaryService: BeneficiaryService;
  let appService: AppService;
  let clientProxy: ClientProxy;

  const mockSettingsService = {
    getPublic: jest.fn().mockResolvedValue({
      value: [
        {
          alias: 'UNICEF Donor',
          address: '0xC52e90DB78DeB581D6CB8b5aEBda0802bA8F37B8',
          privateKey:
            '5fbfba72d025d3ab62849a654b5d90f7839af854f756c0317251e6becc17ac',
          smartAccount: '0xE17Fa0F009d2A3EaC3C2994D7933eD750CbCe257',
        },
        {
          alias: 'UNICEF Head Office',
          address: '0x7131EDcF4500521cB6B55C0658b2d83589946f55',
          privateKey:
            '51812b53380becea3bd28994d28151adb36b7ce04fb777926499fc5e88574b',
          smartAccount: '0xE17Fa0F009d2A3EaC3C2994D7933eD750CbCe257',
        },
        {
          alias: 'UNICEF Field Office',
          address: '0xCc95BeEE78Cc66C03Dc6aa70080d66c85DCB309D',
          privateKey:
            '7d3eec01a87880cb3506377a94f3fd9f232793a094a6a361a8788b6603c6d4',
          smartAccount: '0xe5159f997F32D04F8276567bb2ED2CC0CdC9D8E4',
          isFieldOffice: true,
        },
      ],
    }),
  };

  let stellarQueue: Queue;

  const mockPrismaService = {
    beneficiaryRedeem: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
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
    processVendorOnlinePayout: jest.fn(),
    processVendorOfflinePayout: jest.fn(),
  };

  const mockOfframpService = {
    getPaymentProvider: jest.fn(),
    addBulkToOfframpQueue: jest.fn(),
    addToOfframpQueue: jest.fn(),
    instantOfframp: jest.fn(),
    getOfframpWalletAddress: jest.fn(),
    addToManualPayoutQueue: jest.fn(),
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

  // const ONE_TOKEN_VALUE = 1;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
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
          provide: getQueueToken(BQUEUE.OFFRAMP),
          useValue: mockStellarQueue,
        },
        {
          provide: getQueueToken(BQUEUE.BATCH_TRANSFER),
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
        groupId: 'group-uuid-123',
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
      mockVendorsService.processVendorOnlinePayout.mockResolvedValue({
        success: true,
        message: 'Vendor online payout job added to queue',
      });

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
      expect(
        mockVendorsService.processVendorOnlinePayout
      ).not.toHaveBeenCalled();
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
        groupId: 'group-uuid-123',
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
      mockVendorsService.processVendorOfflinePayout.mockResolvedValue({
        success: true,
        message: 'Vendor offline payout job added to queue',
      });

      const result = await service.create(vendorPayoutDto);

      expect(result).toEqual(mockCreatedPayout);
      expect(mockVendorsService.findOne).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(
        mockVendorsService.processVendorOfflinePayout
      ).toHaveBeenCalledWith({
        beneficiaryGroupUuid: 'group-uuid-123',
        amount: '1000',
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

  describe('getPayoutLogs', () => {
    const mockGetPayoutLogsDto: GetPayoutLogsDto = {
      payoutUUID: 'payout-uuid-123',
      transactionType: 'TOKEN_TRANSFER',
      transactionStatus: 'PENDING',
      page: 1,
      perPage: 10,
      sort: 'createdAt',
      order: 'desc',
      search: '0x123',
    };

    it('should throw RpcException if payout not found', async () => {
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);

      await expect(service.getPayoutLogs(mockGetPayoutLogsDto)).rejects.toThrow(
        `Payout with UUID '${mockGetPayoutLogsDto.payoutUUID}' not found`
      );
    });
    it('should return filtered FSP redeems when payout type is FSP', async () => {
      const mockPayout = { uuid: 'payout-uuid-123', type: 'FSP' };
      mockPrismaService.payouts.findFirst.mockResolvedValue(mockPayout);

      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([
        {
          id: 1,
          beneficiaryWalletAddress: '0xabc',
          transactionType: 'TOKEN_TRANSFER',
          status: 'PENDING',
        },
        {
          id: 2,
          beneficiaryWalletAddress: '0xabc',
          transactionType: 'FIAT_TRANSFER',
          status: 'COMPLETED',
        },
      ]);

      const result = await service.getPayoutLogs({
        payoutUUID: 'payout-uuid-123',
        page: 1,
        perPage: 1,
        sort: 'createdAt',
        order: 'asc',
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.beneficiaryRedeem.findMany).toHaveBeenCalled();
    });

    it('should throw RpcException for unsupported payout type', async () => {
      const mockPayout = { uuid: 'payout-uuid-123', type: 'UNKNOWN' };
      mockPrismaService.payouts.findFirst.mockResolvedValue(mockPayout);

      await expect(service.getPayoutLogs(mockGetPayoutLogsDto)).rejects.toThrow(
        `Unsupported payout type: ${mockPayout.type}`
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockPrismaService.payouts.findFirst.mockRejectedValue(error);

      await expect(service.getPayoutLogs(mockGetPayoutLogsDto)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('downloadPayoutLogs', () => {
    const payoutUUID = 'payout-uuid-123';

    it('should throw RpcException if payout not found', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue(null);

      await expect(service.downloadPayoutLogs(payoutUUID)).rejects.toThrow(
        `Beneficiary redeem log with UUID '${payoutUUID}' not found`
      );
    });

    it('should return formatted FSP payout logs', async () => {
      const mockPayout = {
        uuid: payoutUUID,
        type: 'FSP',
        beneficiaryGroupToken: { numberOfTokens: 100 },
      };

      const mockRedeems = [
        {
          beneficiaryWalletAddress: '0xabc',
          transactionType: 'TOKEN_TRANSFER',
          status: 'PENDING',
          Beneficiary: {
            extras: JSON.stringify({
              phone: '123456',
              bank_ac_name: 'John Doe',
              bank_ac_number: '1111',
              bank_name: 'Bank A',
            }),
            benTokens: 10,
          },
          payout: { type: 'FSP', status: 'COMPLETED' },
          Vendor: null,
          info: JSON.stringify({ transactionHash: 'txhash1' }),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T01:00:00Z'),
        },
        {
          beneficiaryWalletAddress: '0xabc',
          transactionType: 'FIAT_TRANSFER',
          status: 'COMPLETED',
          Beneficiary: {
            extras: JSON.stringify({
              phone: '123456',
              bank_ac_name: 'John Doe',
              bank_ac_number: '1111',
              bank_name: 'Bank A',
            }),
            benTokens: 10,
          },
          payout: { type: 'FSP', status: 'COMPLETED' },
          Vendor: null,
          info: JSON.stringify({ transactionHash: 'txhash2' }),
          createdAt: new Date('2025-01-01T00:00:00Z'),
          updatedAt: new Date('2025-01-01T01:00:00Z'),
        },
      ];

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeems
      );

      const result = await service.downloadPayoutLogs(payoutUUID);

      expect(result).toHaveLength(1);
      const log = result[0];
      expect(log['Beneficiary Wallet Address']).toBe('0xabc');
      expect(log['Phone number']).toBe('123456');
      expect(log['Bank a/c name']).toBe('John Doe');
      expect(log['Bank a/c number']).toBe('1111');
      expect(log['Bank Name']).toBe('Bank A');
      expect(log['Amount Disbursed']).toBe(
        mockRedeems[1].payout.status === 'FAILED'
          ? 0
          : (mockPayout.beneficiaryGroupToken.numberOfTokens || 0) *
              ONE_TOKEN_VALUE
      );
    });

    it('should return formatted Vendorpayout logs', async () => {
      const mockPayout = {
        uuid: payoutUUID,
        type: 'VENDOR',
        beneficiaryGroupToken: { numberOfTokens: 100 },
        beneficiaryRedeem: [
          // add this
          {
            beneficiaryWalletAddress: '0xabc',
            transactionType: 'TOKEN_TRANSFER',
            status: 'COMPLETED',
            Beneficiary: {
              extras: JSON.stringify({ phone: '123456' }),
              benTokens: 10,
            },
            payout: { type: 'VENDOR', status: 'COMPLETED' },
            Vendor: null,
            info: JSON.stringify({ transactionHash: 'txhash1' }),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      const mockRedeems = [
        {
          beneficiaryWalletAddress: '0xabc',
          transactionType: 'TOKEN_TRANSFER',
          status: 'COMPLETED',
          Beneficiary: {
            extras: JSON.stringify({ phone: '123456' }),
            benTokens: 10,
          },
          payout: { type: 'VENDOR', status: 'COMPLETED' },
          Vendor: null,
          info: JSON.stringify({ transactionHash: 'txhash1' }),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeems
      );

      const result = await service.downloadPayoutLogs(payoutUUID);

      expect(result).toHaveLength(1);
      expect(result[0]['Bank a/c name']).toBeUndefined(); // Non-FSP should not have bank fields
      expect(result[0]['Phone number']).toBe('123456');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockPrismaService.payouts.findUnique.mockRejectedValue(error);

      await expect(service.downloadPayoutLogs(payoutUUID)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('syncPayoutStatus', () => {
    it('should update payout status when status changes', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        status: 'PENDING',
        beneficiaryRedeem: [],
      } as any;

      mockPrismaService.payouts.update.mockResolvedValue({
        ...mockPayout,
        status: 'COMPLETED',
      });

      await service.syncPayoutStatus(mockPayout, 'COMPLETED');

      expect(mockPrismaService.payouts.update).toHaveBeenCalledWith({
        where: { uuid: 'payout-123' },
        data: { status: 'COMPLETED' },
      });
      expect(mockPayout.status).toBe('COMPLETED');
    });

    it('should not update payout status when status is same', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        status: 'COMPLETED',
        beneficiaryRedeem: [],
      } as any;

      await service.syncPayoutStatus(mockPayout, 'COMPLETED');

      expect(mockPrismaService.payouts.update).not.toHaveBeenCalled();
    });
  });

  describe('getPayoutCompletedStatus', () => {
    it('should return true for completed VENDOR payout', async () => {
      const mockPayout = {
        type: 'VENDOR',
        beneficiaryRedeem: [{ isCompleted: true }, { isCompleted: true }],
        beneficiaryGroupToken: {
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
          },
        },
      } as any;

      const result = await service.getPayoutCompletedStatus(mockPayout);
      expect(result).toBe(true);
    });

    it('should return false for incomplete VENDOR payout', async () => {
      const mockPayout = {
        type: 'VENDOR',
        beneficiaryRedeem: [{ isCompleted: true }],
        beneficiaryGroupToken: {
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
          },
        },
      } as any;

      const result = await service.getPayoutCompletedStatus(mockPayout);
      expect(result).toBe(false);
    });

    it('should return true for completed FSP payout (2x redeems)', async () => {
      const mockPayout = {
        type: 'FSP',
        beneficiaryRedeem: [
          { isCompleted: true },
          { isCompleted: true },
          { isCompleted: true },
          { isCompleted: true },
        ],
        beneficiaryGroupToken: {
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
          },
        },
      } as any;

      const result = await service.getPayoutCompletedStatus(mockPayout);
      expect(result).toBe(true);
    });

    it('should return false for incomplete FSP payout', async () => {
      const mockPayout = {
        type: 'FSP',
        beneficiaryRedeem: [{ isCompleted: true }, { isCompleted: false }],
        beneficiaryGroupToken: {
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
          },
        },
      } as any;

      const result = await service.getPayoutCompletedStatus(mockPayout);
      expect(result).toBe(false);
    });

    it('should return false when no redeems exist', async () => {
      const mockPayout = {
        type: 'FSP',
        beneficiaryRedeem: [],
        beneficiaryGroupToken: {
          beneficiaryGroup: {
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      } as any;

      const result = await service.getPayoutCompletedStatus(mockPayout);
      expect(result).toBe(false);
    });
  });

  describe('fetchBeneficiaryPayoutDetails', () => {
    it('should return beneficiary payout details successfully', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'FSP',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          beneficiaryGroup: {
            _count: { beneficiaries: 2 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0xWallet1',
                  phone: '1234567890',
                  extras: {
                    bank_ac_name: 'John Doe',
                    bank_ac_number: '12345',
                    bank_name: 'Bank A',
                  },
                },
              },
              {
                beneficiary: {
                  uuid: 'ben-2',
                  walletAddress: '0xWallet2',
                  phone: null,
                  extras: {
                    phone: '0987654321',
                    bank_ac_name: 'Jane Doe',
                    bank_ac_number: '67890',
                    bank_name: 'Bank B',
                  },
                },
              },
            ],
          },
        },
        beneficiaryRedeem: [],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.fetchBeneficiaryPayoutDetails('payout-123');

      expect(result).toHaveLength(2);
      expect(result[0].walletAddress).toBe('0xWallet1');
      expect(result[0].amount).toBe(50);
      expect(result[0].bankDetails.accountName).toBe('John Doe');
    });

    it('should return empty array when no beneficiaries found', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        beneficiaryGroupToken: null,
        beneficiaryRedeem: [],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.fetchBeneficiaryPayoutDetails('payout-123');

      expect(result).toEqual([]);
    });

    it('should throw error when some beneficiaries have missing wallet addresses', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'FSP',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          beneficiaryGroup: {
            _count: { beneficiaries: 2 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0xWallet1',
                  extras: {},
                },
              },
              {
                beneficiary: {
                  uuid: 'ben-2',
                  walletAddress: null, // missing wallet
                  extras: {},
                },
              },
            ],
          },
        },
        beneficiaryRedeem: [],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      await expect(
        service.fetchBeneficiaryPayoutDetails('payout-123')
      ).rejects.toThrow('Some beneficiaries have missing wallet addresses');
    });
  });

  describe('registerTokenTransferRequest', () => {
    it('should register token transfer request successfully', async () => {
      const payload = {
        uuid: 'payout-123',
        offrampWalletAddress: '0xOfframp',
        BeneficiaryPayoutDetails: [
          {
            amount: 50,
            walletAddress: '0xWallet1',
            phoneNumber: '123',
            bankDetails: {
              accountName: 'John',
              accountNumber: '12345',
              bankName: 'Bank A',
            },
          },
        ],
        payoutProcessorId: 'processor-1',
        offrampType: 'bank_transfer',
      };

      mockStellarService.addBulkToTokenTransferQueue.mockResolvedValue({
        success: true,
      });

      const result = await service.registerTokenTransferRequest(payload);

      expect(
        mockStellarService.addBulkToTokenTransferQueue
      ).toHaveBeenCalledWith([
        {
          amount: 50,
          beneficiaryWalletAddress: '0xWallet1',
          beneficiaryBankDetails:
            payload.BeneficiaryPayoutDetails[0].bankDetails,
          payoutUUID: 'payout-123',
          payoutProcessorId: 'processor-1',
          offrampWalletAddress: '0xOfframp',
          offrampType: 'bank_transfer',
        },
      ]);
      expect(result).toEqual({ success: true });
    });
  });

  describe('triggerPayout', () => {
    it('should trigger payout successfully', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'FSP',
        isPayoutTriggered: false,
        payoutProcessorId: 'processor-1',
        extras: {
          paymentProviderType: 'bank_transfer',
          paymentProviderName: 'Bank Transfer',
        },
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            _count: { beneficiaries: 2 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0xWallet1',
                  phone: '123',
                  extras: {
                    bank_ac_name: 'John',
                    bank_ac_number: '12345',
                    bank_name: 'Bank A',
                  },
                },
              },
              {
                beneficiary: {
                  uuid: 'ben-2',
                  walletAddress: '0xWallet2',
                  phone: '456',
                  extras: {
                    bank_ac_name: 'Jane',
                    bank_ac_number: '67890',
                    bank_name: 'Bank B',
                  },
                },
              },
            ],
          },
        },
        beneficiaryRedeem: [],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );
      mockOfframpService.getOfframpWalletAddress.mockResolvedValue('0xOfframp');
      mockStellarService.addBulkToTokenTransferQueue.mockResolvedValue({
        success: true,
      });

      const result = await service.triggerPayout('payout-123', {
        name: 'Admin',
      });

      expect(result).toBe(
        'Payout verification initiated successfully. It may take some time to complete. If a payout verification fails, you can retry it by re-clicking "Verify Manual Payout" button.'
      );
      expect(mockStellarService.addBulkToTokenTransferQueue).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.NOTIFICATION.CREATE,
        expect.any(Object)
      );
    });

    it('should throw error when payout already triggered', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        isPayoutTriggered: true,
        type: 'FSP',
        status: 'PENDING',
        beneficiaryRedeem: [{ id: 1, status: 'PENDING', isCompleted: false }],
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 100,
          beneficiaryGroup: {
            _count: { beneficiaries: 1 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0x1',
                  extras: {},
                },
              },
            ],
          },
        },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      await expect(service.triggerPayout('payout-123')).rejects.toThrow(
        "Payout with UUID 'payout-123' has already been triggered"
      );
    });

    it('should throw error when tokens have not been disbursed to the beneficiary group', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        isPayoutTriggered: false,
        type: 'FSP',
        status: 'PENDING',
        payoutProcessorId: 'processor-1',
        beneficiaryRedeem: [],
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 100,
          isDisbursed: false,
          beneficiaryGroup: {
            name: 'Test Group',
            _count: { beneficiaries: 1 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0x1',
                  extras: {},
                },
              },
            ],
          },
        },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      await expect(service.triggerPayout('payout-123')).rejects.toThrow(
        `Payout cannot be triggered as tokens have not been disbursed to the beneficiary group "Test Group" yet. Please wait until the fund disbursement is completed and try again later.`
      );
    });

    it('should throw error for manual-bank-transfer payout', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        isPayoutTriggered: false,
        type: 'FSP',
        status: 'PENDING',
        payoutProcessorId: 'manual-bank-transfer',
        beneficiaryRedeem: [],
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            _count: { beneficiaries: 1 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0x1',
                  extras: {},
                },
              },
            ],
          },
        },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      await expect(service.triggerPayout('payout-123')).rejects.toThrow(
        'Manual bank transfer payouts cannot be triggered'
      );
    });
  });

  describe('triggerOneFailedPayoutRequest', () => {
    it('should process failed token transfer request', async () => {
      const mockRedeemRequest = {
        uuid: 'redeem-123',
        isCompleted: false,
        transactionType: 'TOKEN_TRANSFER',
        status: 'TOKEN_TRANSACTION_FAILED',
        amount: 50,
        beneficiaryWalletAddress: '0xWallet1',
        payoutId: 'payout-123',
        fspId: 'fsp-123',
        Beneficiary: {
          phone: '123',
          extras: {
            bank_ac_name: 'John',
            bank_ac_number: '12345',
            bank_name: 'Bank A',
          },
        },
        info: {
          offrampWalletAddress: '0xOfframp',
          offrampType: 'bank_transfer',
        },
      };

      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(
        mockRedeemRequest
      );
      mockStellarService.addToTokenTransferQueue.mockResolvedValue({
        success: true,
      });
      mockBeneficiaryService.updateBeneficiaryRedeem.mockResolvedValue({
        success: true,
      });

      const result = await service.triggerOneFailedPayoutRequest({
        beneficiaryRedeemUuid: 'redeem-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Token transfer triggered successfully');
    });

    it('should process failed fiat transfer request', async () => {
      const mockRedeemRequest = {
        uuid: 'redeem-123',
        isCompleted: false,
        transactionType: 'FIAT_TRANSFER',
        status: 'FIAT_TRANSACTION_FAILED',
        amount: 50,
        beneficiaryWalletAddress: '0xWallet1',
        payoutId: 'payout-123',
        fspId: 'fsp-123',
        Beneficiary: {
          phone: '123',
          extras: {
            bank_ac_name: 'John',
            bank_ac_number: '12345',
            bank_name: 'Bank A',
          },
        },
        info: {
          offrampWalletAddress: '0xOfframp',
          offrampType: 'bank_transfer',
        },
      };

      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(
        mockRedeemRequest
      );
      mockOfframpService.addToOfframpQueue.mockResolvedValue({ success: true });
      mockBeneficiaryService.updateBeneficiaryRedeem.mockResolvedValue({
        success: true,
      });

      const result = await service.triggerOneFailedPayoutRequest({
        beneficiaryRedeemUuid: 'redeem-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Fiat payout triggered successfully');
    });

    it('should throw error when redeem request not found', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(null);

      await expect(
        service.triggerOneFailedPayoutRequest({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' not found"
      );
    });

    it('should throw error when redeem is already completed', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue({
        uuid: 'redeem-123',
        isCompleted: true,
      });

      await expect(
        service.triggerOneFailedPayoutRequest({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' is already completed"
      );
    });

    it('should throw error for VENDOR_REIMBURSEMENT type', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue({
        uuid: 'redeem-123',
        isCompleted: false,
        transactionType: 'VENDOR_REIMBURSEMENT',
      });

      await expect(
        service.triggerOneFailedPayoutRequest({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' is not a FSP Payout request"
      );
    });

    it('should throw error when token transfer is already initiated', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue({
        uuid: 'redeem-123',
        isCompleted: false,
        transactionType: 'TOKEN_TRANSFER',
        status: 'TOKEN_TRANSACTION_INITIATED',
      });

      await expect(
        service.triggerOneFailedPayoutRequest({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' is already initiated"
      );
    });

    it('should throw error when fiat transfer is already initiated', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue({
        uuid: 'redeem-123',
        isCompleted: false,
        transactionType: 'FIAT_TRANSFER',
        status: 'FIAT_TRANSACTION_INITIATED',
      });

      await expect(
        service.triggerOneFailedPayoutRequest({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' is already initiated"
      );
    });
  });

  describe('triggerFailedPayoutRequest', () => {
    it('should throw error when payoutUUID is not provided', async () => {
      await expect(
        service.triggerFailedPayoutRequest({ payoutUUID: '' })
      ).rejects.toThrow('Payout UUID is required for failed payout request');
    });

    it('should throw error when payout is not triggered yet', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'FSP',
        isPayoutTriggered: false,
        beneficiaryRedeem: [],
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          beneficiaryGroup: { _count: { beneficiaries: 1 } },
        },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      await expect(
        service.triggerFailedPayoutRequest({ payoutUUID: 'payout-123' })
      ).rejects.toThrow("Payout with UUID 'payout-123' has not been triggered");
    });
  });

  describe('getPayoutLog', () => {
    it('should return payout log successfully', async () => {
      const mockLog = {
        uuid: 'redeem-123',
        beneficiaryWalletAddress: '0xWallet1',
        Beneficiary: { uuid: 'ben-1' },
        payout: { uuid: 'payout-123' },
        Vendor: null,
      };

      mockPrismaService.beneficiaryRedeem.findUnique.mockResolvedValue(mockLog);

      const result = await service.getPayoutLog('redeem-123');

      expect(result).toEqual(mockLog);
      expect(
        mockPrismaService.beneficiaryRedeem.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid: 'redeem-123' },
        include: {
          Beneficiary: true,
          payout: true,
          Vendor: true,
        },
      });
    });

    it('should throw error when log not found', async () => {
      mockPrismaService.beneficiaryRedeem.findUnique.mockResolvedValue(null);

      await expect(service.getPayoutLog('redeem-123')).rejects.toThrow(
        "Beneficiary redeem log with UUID 'redeem-123' not found"
      );
    });
  });

  describe('getPayoutLogs - VENDOR type', () => {
    it('should return paginated vendor payout logs', async () => {
      const mockPayout = { uuid: 'payout-123', type: 'VENDOR' };

      mockPrismaService.payouts.findFirst.mockResolvedValue(mockPayout);
      mockPrismaService.beneficiaryRedeem.count.mockResolvedValue(1);
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([
        {
          uuid: 'redeem-1',
          beneficiaryWalletAddress: '0xWallet1',
          transactionType: 'VENDOR_REIMBURSEMENT',
          status: 'COMPLETED',
        },
      ]);

      const result = await service.getPayoutLogs({
        payoutUUID: 'payout-123',
        page: 1,
        perPage: 10,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.data).toBeDefined();
    });
  });

  describe('update - edge cases', () => {
    it('should throw error when payout not found for update', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { status: 'COMPLETED' })
      ).rejects.toThrow("Payout with UUID 'non-existent' not found");
    });
  });

  describe('calculatePayoutCompletionGap - edge cases', () => {
    it('should return N/A when active year or river basin missing', async () => {
      mockAppService.getSettings.mockResolvedValue({
        value: { project_name: 'Test' }, // missing active_year and river_basin
      });

      const result = await service.calculatePayoutCompletionGap('payout-123');

      expect(result).toBe('N/A');
    });

    it('should return N/A when activation phase not found', async () => {
      mockAppService.getSettings.mockResolvedValue({
        value: { active_year: '2024', river_basin: 'test-basin' },
      });

      mockClientProxy.send.mockReturnValue(of({ data: [] }));

      const result = await service.calculatePayoutCompletionGap('payout-123');

      expect(result).toBe('N/A');
    });

    it('should return N/A when activation phase is not active', async () => {
      mockAppService.getSettings.mockResolvedValue({
        value: { active_year: '2024', river_basin: 'test-basin' },
      });

      mockClientProxy.send.mockReturnValue(
        of({ data: [{ name: 'ACTIVATION', isActive: false }] })
      );

      const result = await service.calculatePayoutCompletionGap('payout-123');

      expect(result).toBe('N/A');
    });
  });

  describe('create - additional scenarios', () => {
    it('should create VENDOR ONLINE payout successfully', async () => {
      const vendorOnlinePayoutDto = {
        groupId: 'group-uuid-123',
        type: PayoutType.VENDOR,
        mode: PayoutMode.ONLINE,
        status: 'PENDING',
        user: { name: 'Admin User' },
      };

      const mockBeneficiaryGroup = {
        uuid: 'group-uuid-123',
        groupId: 'group-uuid-123',
        numberOfTokens: 1000,
        beneficiaryGroup: {
          name: 'Test Group',
          beneficiaries: [{ id: 'ben-1' }, { id: 'ben-2' }],
        },
      };

      const mockCreatedPayout = {
        uuid: 'payout-uuid-123',
        type: PayoutType.VENDOR,
        mode: PayoutMode.ONLINE,
      };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);
      mockPrismaService.payouts.create.mockResolvedValue(mockCreatedPayout);
      mockVendorsService.processVendorOnlinePayout.mockResolvedValue({
        success: true,
      });

      const result = await service.create(vendorOnlinePayoutDto);

      expect(result).toEqual(mockCreatedPayout);
      expect(mockVendorsService.processVendorOnlinePayout).toHaveBeenCalledWith(
        {
          beneficiaryGroupUuid: 'group-uuid-123',
          amount: '1000',
        }
      );
    });

    it('should create manual-bank-transfer payout successfully', async () => {
      const manualPayoutDto = {
        groupId: 'group-uuid-123',
        type: PayoutType.FSP,
        mode: PayoutMode.ONLINE,
        payoutProcessorId: 'manual-bank-transfer',
        status: 'PENDING',
        user: { name: 'Admin User' },
      };

      const mockBeneficiaryGroup = {
        uuid: 'group-uuid-123',
        groupId: 'group-uuid-123',
        numberOfTokens: 1000,
        beneficiaryGroup: {
          name: 'Test Group',
          _count: { beneficiaries: 2 },
          beneficiaries: [
            {
              beneficiary: {
                uuid: 'ben-1',
                walletAddress: '0xWallet1',
                phone: '123',
                extras: {
                  bank_ac_name: 'John',
                  bank_ac_number: '12345',
                  bank_name: 'Bank A',
                },
              },
            },
            {
              beneficiary: {
                uuid: 'ben-2',
                walletAddress: '0xWallet2',
                phone: '456',
                extras: {
                  bank_ac_name: 'Jane',
                  bank_ac_number: '67890',
                  bank_name: 'Bank B',
                },
              },
            },
          ],
        },
      };

      const mockCreatedPayout = {
        uuid: 'payout-uuid-123',
        type: PayoutType.FSP,
        payoutProcessorId: 'manual-bank-transfer',
      };

      mockPrismaService.beneficiaryGroupTokens.findFirst.mockResolvedValue(
        mockBeneficiaryGroup
      );
      mockPrismaService.payouts.findFirst.mockResolvedValue(null);
      mockPrismaService.payouts.create.mockResolvedValue(mockCreatedPayout);
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        ...mockCreatedPayout,
        beneficiaryGroupToken: mockBeneficiaryGroup,
        beneficiaryRedeem: [],
      });
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );
      mockOfframpService.addToManualPayoutQueue.mockResolvedValue({
        success: true,
      });

      const result = await service.create(manualPayoutDto);

      expect(result).toEqual(mockCreatedPayout);
      expect(mockOfframpService.addToManualPayoutQueue).toHaveBeenCalled();
    });
  });

  describe('verifyManualPayout', () => {
    it('should throw error when payoutUUID is empty', async () => {
      await expect(service.verifyManualPayout('')).rejects.toThrow(
        'Payout verification failed: Payout UUID is required but was not provided'
      );
    });

    it('should throw error when payoutUUID is invalid', async () => {
      await expect(service.verifyManualPayout('invalid-uuid')).rejects.toThrow(
        "Payout verification failed: Invalid UUID format provided: 'invalid-uuid'"
      );
    });

    it('should throw error when payout not found', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow(
        "Payout verification failed: Payout with UUID '123e4567-e89b-12d3-a456-426614174000' not found"
      );
    });

    it('should throw error when tokens have not been disbursed to the beneficiary group', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: false,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow(
        `Payout cannot be verified as tokens have not been disbursed to the beneficiary group "Test Group" yet. Please wait until the fund disbursement is completed and try again later.`
      );
    });

    it('should throw error when no beneficiaries found', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: null,
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow('Payout verification failed: No beneficiaries found');
    });

    it('should throw error when data is invalid', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000', null)
      ).rejects.toThrow(
        'Payout verification failed: Invalid or missing payout data provided'
      );
    });

    it('should throw error when data is empty object', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000', {})
      ).rejects.toThrow('Payout verification failed: No payout records found');
    });

    it('should throw error when bank account number missing in row', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000', {
          row1: {
            'Bank Account Holder Name ': 'John Doe',
            'Transaction Status': 'completed',
            'Bank Account Number': '',
            Amount: 100,
            Remark: '',
            'Bank Name': '',
            'Approval Date': '',
            Date: '',
          } as any,
        })
      ).rejects.toThrow(
        'Payout verification failed: Missing bank account number in row 1'
      );
    });

    it('should throw error when bank account holder name missing in row', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000', {
          row1: {
            'Bank Account Number': '12345',
            'Transaction Status': 'completed',
            'Bank Account Holder Name ': '',
            Amount: 100,
            Remark: '',
            'Bank Name': '',
            'Approval Date': '',
            Date: '',
          } as any,
        })
      ).rejects.toThrow(
        'Payout verification failed: Missing bank account holder name in row 1'
      );
    });

    it('should throw error when no beneficiaries matched', async () => {
      mockPrismaService.payouts.findUnique.mockResolvedValue({
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [{ id: 'ben-1' }],
          },
        },
      });

      mockPrismaService.beneficiary.findMany.mockResolvedValue([]);

      await expect(
        service.verifyManualPayout('123e4567-e89b-12d3-a456-426614174000', {
          row1: {
            'Bank Account Number': '12345',
            'Bank Account Holder Name ': 'John Doe',
            'Transaction Status': 'completed',
            Amount: 100,
            Remark: '',
            'Bank Name': 'Test Bank',
            'Approval Date': '2024-01-01',
            Date: '2024-01-01',
          },
        })
      ).rejects.toThrow(
        'Payout verification failed: No beneficiary bank accounts matched'
      );
    });

    it('should verify manual payout successfully', async () => {
      const mockPayout = {
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        beneficiaryGroupToken: {
          numberOfTokens: 100,
          isDisbursed: true,
          beneficiaryGroup: {
            name: 'Test Group',
            beneficiaries: [
              {
                beneficiary: {
                  walletAddress: '0xWallet1',
                  extras: { bank_ac_number: '12345' },
                },
              },
            ],
          },
        },
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockPrismaService.beneficiary.findMany.mockResolvedValue([
        {
          uuid: 'ben-1',
          walletAddress: '0xWallet1',
          phone: '123',
          extras: {
            bank_ac_number: '12345',
            bank_ac_name: 'John',
            bank_name: 'Bank A',
          },
          BeneficiaryRedeem: [{ uuid: 'redeem-1' }],
        },
      ]);
      mockStellarQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.verifyManualPayout(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          row1: {
            'Bank Account Number': '12345',
            'Bank Account Holder Name ': 'John Doe',
            'Transaction Status': 'completed',
            Date: '2024-01-01',
            'Approval Date': '2024-01-02',
            Amount: 100,
            Remark: '',
            'Bank Name': 'Test Bank',
          },
        }
      );

      expect(result.matched).toHaveLength(1);
      expect(result.unmatched).toHaveLength(0);
    });
  });

  describe('processOneFailedFiatPayout', () => {
    it('should process one failed fiat payout successfully', async () => {
      const mockRedeemRequest = {
        uuid: 'redeem-123',
        amount: 50,
        beneficiaryWalletAddress: '0xWallet1',
        payoutId: 'payout-123',
        fspId: 'fsp-123',
        Beneficiary: {
          phone: '123',
          extras: {
            bank_ac_name: 'John',
            bank_ac_number: '12345',
            bank_name: 'Bank A',
          },
        },
        info: {
          offrampWalletAddress: '0xOfframp',
          offrampType: 'bank_transfer',
        },
      };

      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(
        mockRedeemRequest
      );
      mockOfframpService.addToOfframpQueue.mockResolvedValue({ success: true });
      mockBeneficiaryService.updateBeneficiaryRedeem.mockResolvedValue({
        success: true,
      });

      const result = await service.processOneFailedFiatPayout({
        beneficiaryRedeemUuid: 'redeem-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Fiat payout triggered successfully');
    });

    it('should throw error when redeem request not found', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(null);

      await expect(
        service.processOneFailedFiatPayout({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        "Beneficiary redeem request with UUID 'redeem-123' not found"
      );
    });

    it('should throw error when offramp wallet address missing', async () => {
      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue({
        uuid: 'redeem-123',
        amount: 50,
        beneficiaryWalletAddress: '0xWallet1',
        Beneficiary: { extras: {} },
        info: {},
      });

      await expect(
        service.processOneFailedFiatPayout({
          beneficiaryRedeemUuid: 'redeem-123',
        })
      ).rejects.toThrow(
        'Offramp wallet address not found for beneficiary redeem request'
      );
    });
  });

  describe('processOneFailedTokenTransferPayout', () => {
    it('should process one failed token transfer payout successfully', async () => {
      const mockRedeemRequest = {
        uuid: 'redeem-123',
        amount: 50,
        beneficiaryWalletAddress: '0xWallet1',
        payoutId: 'payout-123',
        fspId: 'fsp-123',
        Beneficiary: {
          phone: '123',
          extras: {
            bank_ac_name: 'John',
            bank_ac_number: '12345',
            bank_name: 'Bank A',
          },
        },
        info: {
          offrampWalletAddress: '0xOfframp',
          offrampType: 'bank_transfer',
        },
      };

      mockBeneficiaryService.getBeneficiaryRedeem.mockResolvedValue(
        mockRedeemRequest
      );
      mockStellarService.addToTokenTransferQueue.mockResolvedValue({
        success: true,
      });
      mockBeneficiaryService.updateBeneficiaryRedeem.mockResolvedValue({
        success: true,
      });

      const result = await service.processOneFailedTokenTransferPayout({
        beneficiaryRedeemUuid: 'redeem-123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Token transfer triggered successfully');
    });
  });

  describe('findAll - edge cases', () => {
    it('should handle findAll with COMPLETED status payouts', async () => {
      const mockPayouts = [
        {
          uuid: 'payout-1',
          type: PayoutType.FSP,
          status: 'COMPLETED',
          beneficiaryGroupToken: {
            numberOfTokens: 1000,
            groupId: 'group-1',
            beneficiaryGroup: {
              _count: { beneficiaries: 10 },
            },
          },
          beneficiaryRedeem: [{ status: 'FIAT_TRANSACTION_COMPLETED' }],
        },
      ];

      Object.assign(mockPrismaService.payouts, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(mockPayouts),
      });

      const result = await service.findAll({ page: 1, perPage: 10 });

      expect(result.data).toBeDefined();
      expect(result.data.length).toBe(1);
    });

    it('should handle findAll errors gracefully', async () => {
      Object.assign(mockPrismaService.payouts, {
        findMany: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      await expect(service.findAll({ page: 1, perPage: 10 })).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('findOne - edge cases', () => {
    it('should calculate totalSuccessRequests for VENDOR type', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'VENDOR',
        status: 'PENDING',
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 1000,
          beneficiaryGroup: {
            _count: { beneficiaries: 2 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0x1',
                  extras: {},
                },
              },
              {
                beneficiary: {
                  uuid: 'ben-2',
                  walletAddress: '0x2',
                  extras: {},
                },
              },
            ],
          },
        },
        beneficiaryRedeem: [
          { status: 'COMPLETED', isCompleted: true },
          { status: 'PENDING', isCompleted: false },
        ],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.findOne('payout-123');

      expect(result.totalSuccessRequests).toBe(1);
    });

    it('should calculate totalSuccessRequests for FSP type', async () => {
      const mockPayout = {
        uuid: 'payout-123',
        type: 'FSP',
        status: 'PENDING',
        beneficiaryGroupToken: {
          groupId: 'group-123',
          numberOfTokens: 1000,
          beneficiaryGroup: {
            _count: { beneficiaries: 2 },
            beneficiaries: [
              {
                beneficiary: {
                  uuid: 'ben-1',
                  walletAddress: '0x1',
                  extras: {},
                },
              },
              {
                beneficiary: {
                  uuid: 'ben-2',
                  walletAddress: '0x2',
                  extras: {},
                },
              },
            ],
          },
        },
        beneficiaryRedeem: [
          { status: 'FIAT_TRANSACTION_COMPLETED', isCompleted: true },
          { status: 'PENDING', isCompleted: false },
        ],
      };

      mockPrismaService.payouts.findUnique.mockResolvedValue(mockPayout);
      mockBeneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID.mockResolvedValue(
        []
      );

      const result = await service.findOne('payout-123');

      expect(result.totalSuccessRequests).toBe(1);
    });
  });
});
