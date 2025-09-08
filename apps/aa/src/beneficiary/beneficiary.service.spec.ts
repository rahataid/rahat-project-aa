import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiaryService } from './beneficiary.service';
import { PrismaService } from '@rumsan/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { GetBenfGroupDto } from './dto/get-group.dto';
import { GroupPurpose } from '@prisma/client';
import { of } from 'rxjs';

describe('BeneficiaryService', () => {
  let service: BeneficiaryService;
  let prismaService: PrismaService;
  let clientProxy: ClientProxy;
  let eventEmitter: EventEmitter2;
  let contractQueue: any;
  let stellarQueue: any;

  const mockPrismaService = {
    beneficiary: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    beneficiaryGroups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    beneficiaryGroupTokens: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    beneficiaryToGroup: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    beneficiaryRedeem: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    rsclient: {
      beneficiary: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    },
  };

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeneficiaryService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CORE_MODULE,
          useValue: mockClientProxy,
        },
        {
          provide: getQueueToken(BQUEUE.CONTRACT),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR),
          useValue: mockQueue,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<BeneficiaryService>(BeneficiaryService);
    prismaService = module.get<PrismaService>(PrismaService);
    clientProxy = module.get<ClientProxy>(CORE_MODULE);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    contractQueue = module.get(getQueueToken(BQUEUE.CONTRACT));
    stellarQueue = module.get(getQueueToken(BQUEUE.STELLAR));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllBenfs', () => {
    it('should return all beneficiaries', async () => {
      const mockBeneficiaries = [
        { id: 1, uuid: 'ben-1', name: 'John Doe' },
        { id: 2, uuid: 'ben-2', name: 'Jane Smith' },
      ];

      mockPrismaService.beneficiary.findMany.mockResolvedValue(
        mockBeneficiaries
      );

      const result = await service.getAllBenfs();

      expect(result).toEqual(mockBeneficiaries);
      expect(mockPrismaService.beneficiary.findMany).toHaveBeenCalledWith();
    });
  });

  describe('getCount', () => {
    it('should return count of beneficiaries excluding deleted ones', async () => {
      const mockCount = 50;
      mockPrismaService.beneficiary.count.mockResolvedValue(mockCount);

      const result = await service.getCount();

      expect(result).toBe(mockCount);
      expect(mockPrismaService.beneficiary.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
        },
      });
    });
  });

  describe('getBenfBetweenIds', () => {
    it('should return beneficiaries between start and end IDs', async () => {
      const startId = 1;
      const endId = 10;
      const mockBeneficiaries = [
        { id: 1, uuid: 'ben-1', name: 'John Doe' },
        { id: 5, uuid: 'ben-5', name: 'Jane Smith' },
      ];

      mockPrismaService.beneficiary.findMany.mockResolvedValue(
        mockBeneficiaries
      );

      const result = await service.getBenfBetweenIds(startId, endId);

      expect(result).toEqual(mockBeneficiaries);
      expect(mockPrismaService.beneficiary.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            gte: startId,
            lte: endId,
          },
        },
      });
    });
  });

  describe('create', () => {
    it('should create a beneficiary and emit event', async () => {
      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
        isVerified: true,
        location: { lat: 27.7, lng: 85.3 },
        extras: { note: 'test note' },
      } as CreateBeneficiaryDto;

      const expectedData = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
        location: { lat: 27.7, lng: 85.3 },
        extras: {
          note: 'test note',
        },
      };

      const mockCreatedBeneficiary = { id: 1, ...expectedData };
      mockPrismaService.rsclient.beneficiary.create.mockResolvedValue(
        mockCreatedBeneficiary
      );

      const result = await service.create(createDto);

      expect(result).toEqual(mockCreatedBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.create
      ).toHaveBeenCalledWith({
        data: expectedData,
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.BENEFICIARY_CREATED
      );
    });

    it('should create beneficiary without location', async () => {
      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
        isVerified: true,
        extras: { note: 'test note' },
      } as CreateBeneficiaryDto;

      const expectedData = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
        extras: {
          note: 'test note',
        },
      };

      const mockCreatedBeneficiary = { id: 1, ...expectedData };
      mockPrismaService.rsclient.beneficiary.create.mockResolvedValue(
        mockCreatedBeneficiary
      );

      const result = await service.create(createDto);

      expect(result).toEqual(mockCreatedBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.create
      ).toHaveBeenCalledWith({
        data: expectedData,
      });
    });
  });

  describe('createMany', () => {
    it('should create multiple beneficiaries and emit event', async () => {
      const createManyDto = [
        { uuid: 'ben-1', name: 'John Doe' },
        { uuid: 'ben-2', name: 'Jane Smith' },
      ];

      const mockResult = { count: 2 };
      mockPrismaService.rsclient.beneficiary.createMany.mockResolvedValue(
        mockResult
      );

      const result = await service.createMany(createManyDto);

      expect(result).toEqual(mockResult);
      expect(
        mockPrismaService.rsclient.beneficiary.createMany
      ).toHaveBeenCalledWith({
        data: createManyDto,
        skipDuplicates: true,
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.BENEFICIARY_CREATED
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated beneficiaries and send to client', async () => {
      const dto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc' as const,
      };

      const mockPaginatedResult = {
        data: [{ id: 1, uuid: 'ben-1', name: 'John Doe' }],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      const mockClientResponse = of(mockPaginatedResult);
      mockClientProxy.send.mockReturnValue(mockClientResponse);

      // Mock the paginate function result - need to ensure the rsprisma beneficiary model has required methods
      Object.assign(mockPrismaService.rsclient.beneficiary, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 1, uuid: 'ben-1', name: 'John Doe' }]),
      });

      const result = await service.findAll(dto);

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.list_by_project' },
        expect.any(Object)
      );
    });
  });

  describe('getAllGroups', () => {
    it('should return paginated beneficiary groups with filters', async () => {
      const dto: GetBenfGroupDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
        tokenAssigned: true,
        search: 'test',
        hasPayout: false,
      };

      const mockGroups = {
        data: [
          {
            id: 1,
            uuid: 'group-1',
            name: 'Test Group',
            _count: { beneficiaries: 5 },
            beneficiaries: [],
            tokensReserved: { payoutId: null, isDisbursed: true },
          },
        ],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      const mockClientResponse = {
        data: [
          {
            uuid: 'group-1',
            name: 'Test Group',
            beneficiaryCount: 5,
          },
        ],
      };

      // Mock the prisma beneficiary groups methods for paginate function
      Object.assign(mockPrismaService.beneficiaryGroups, {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(mockGroups.data),
      });

      mockClientProxy.send.mockReturnValue(of(mockClientResponse));

      const result = await service.getAllGroups(dto);

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        expect.objectContaining({
          data: expect.any(Array),
          meta: expect.any(Object),
        })
      );
    });

    it('should handle getAllGroups with tokenAssigned false', async () => {
      const dto: GetBenfGroupDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
        tokenAssigned: false,
      };

      const mockGroups = {
        data: [],
        meta: { total: 0, page: 1, perPage: 20 },
      };

      const mockClientResponse = { data: [] };

      Object.assign(mockPrismaService.beneficiaryGroups, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      mockClientProxy.send.mockReturnValue(of(mockClientResponse));

      await service.getAllGroups(dto);

      expect(mockClientProxy.send).toHaveBeenCalled();
    });

    it('should handle getAllGroups with hasPayout true', async () => {
      const dto: GetBenfGroupDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
        hasPayout: true,
      };

      const mockGroups = {
        data: [],
        meta: { total: 0, page: 1, perPage: 20 },
      };

      const mockClientResponse = { data: [] };

      Object.assign(mockPrismaService.beneficiaryGroups, {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      });

      mockClientProxy.send.mockReturnValue(of(mockClientResponse));

      await service.getAllGroups(dto);

      expect(mockClientProxy.send).toHaveBeenCalled();
    });
  });

  describe('getBeneficiaryRedeemInfo', () => {
    it('should return beneficiary redeem information', async () => {
      const beneficiaryUUID = 'ben-uuid-123';
      const mockBeneficiary = { walletAddress: 'wallet-address-123' };
      const mockRedeemRecords = [
        {
          beneficiaryWalletAddress: 'wallet-address-123',
          amount: 100,
          transactionType: 'VOUCHER',
          status: 'PENDING',
          txHash: 'tx-hash-123',
        },
      ];

      mockPrismaService.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeemRecords
      );

      const result = await service.getBeneficiaryRedeemInfo(beneficiaryUUID);

      expect(result).toEqual([
        {
          beneficiaryWallet: 'wallet-address-123',
          tokenAmount: 100,
          transactionType: 'VOUCHER',
          status: 'PENDING',
          txHash: 'tx-hash-123',
        },
      ]);

      expect(mockPrismaService.beneficiary.findUnique).toHaveBeenCalledWith({
        where: { uuid: beneficiaryUUID },
        select: { walletAddress: true },
      });
    });

    it('should throw RpcException when beneficiaryUUID is empty', async () => {
      await expect(service.getBeneficiaryRedeemInfo('')).rejects.toThrow(
        new RpcException('Beneficiary UUID is required')
      );
    });

    it('should throw RpcException when beneficiary not found', async () => {
      const beneficiaryUUID = 'non-existent-uuid';
      mockPrismaService.beneficiary.findUnique.mockResolvedValue(null);

      await expect(
        service.getBeneficiaryRedeemInfo(beneficiaryUUID)
      ).rejects.toThrow(new RpcException('Beneficiary not found'));
    });

    it('should throw RpcException when no redeem records found', async () => {
      const beneficiaryUUID = 'ben-uuid-123';
      const mockBeneficiary = { walletAddress: 'wallet-address-123' };

      mockPrismaService.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue([]);

      await expect(
        service.getBeneficiaryRedeemInfo(beneficiaryUUID)
      ).rejects.toThrow(
        new RpcException('No redeem records found for this beneficiary')
      );
    });

    it('should handle errors and re-throw them', async () => {
      const beneficiaryUUID = 'ben-uuid-123';
      const error = new Error('Database error');

      mockPrismaService.beneficiary.findUnique.mockRejectedValue(error);

      await expect(
        service.getBeneficiaryRedeemInfo(beneficiaryUUID)
      ).rejects.toThrow(error);
    });
  });

  describe('getFailedBeneficiaryRedeemByPayoutUUID', () => {
    it('should return failed beneficiary redeems grouped by status', async () => {
      const payoutUUID = 'payout-uuid-123';
      const mockResult = [
        {
          status: 'FIAT_TRANSACTION_FAILED',
          count: 2,
          beneficiaryRedeems: [{ uuid: 'redeem-1' }, { uuid: 'redeem-2' }],
        },
      ];

      mockPrismaService.$queryRaw.mockResolvedValue(mockResult);

      const result = await service.getFailedBeneficiaryRedeemByPayoutUUID(
        payoutUUID
      );

      expect(result).toEqual(mockResult);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('getBeneficiaryRedeem', () => {
    it('should return beneficiary redeem with relations', async () => {
      const uuid = 'redeem-uuid-123';
      const mockRedeem = {
        uuid,
        amount: 100,
        payout: { uuid: 'payout-123' },
        Beneficiary: { uuid: 'ben-123' },
      };

      mockPrismaService.beneficiaryRedeem.findUnique.mockResolvedValue(
        mockRedeem
      );

      const result = await service.getBeneficiaryRedeem(uuid);

      expect(result).toEqual(mockRedeem);
      expect(
        mockPrismaService.beneficiaryRedeem.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid },
        include: {
          payout: true,
          Beneficiary: true,
        },
      });
    });

    it('should handle errors when getting beneficiary redeem', async () => {
      const uuid = 'redeem-uuid-123';
      const error = new Error('Database error');

      mockPrismaService.beneficiaryRedeem.findUnique.mockRejectedValue(error);

      await expect(service.getBeneficiaryRedeem(uuid)).rejects.toThrow(error);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors in getAllBenfs', async () => {
      const error = new Error('Database connection failed');
      mockPrismaService.beneficiary.findMany.mockRejectedValue(error);

      await expect(service.getAllBenfs()).rejects.toThrow(error);
    });

    it('should handle database errors in getCount', async () => {
      const error = new Error('Database connection failed');
      mockPrismaService.beneficiary.count.mockRejectedValue(error);

      await expect(service.getCount()).rejects.toThrow(error);
    });

    it('should handle database errors in create', async () => {
      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
      } as CreateBeneficiaryDto;

      const error = new Error('Database insert failed');
      mockPrismaService.rsclient.beneficiary.create.mockRejectedValue(error);

      await expect(service.create(createDto)).rejects.toThrow(error);
    });
  });

  describe('findByUUID', () => {
    it('should find beneficiary by UUID', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000' as any;
      const mockBeneficiary = { id: 1, uuid, name: 'John Doe' };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );

      const result = await service.findByUUID(uuid);

      expect(result).toEqual(mockBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid },
      });
    });
  });

  describe('findOne', () => {
    it('should find one beneficiary and merge with provided data', async () => {
      const payload = {
        uuid: 'ben-uuid-123',
        data: { extra: 'extraData' },
      };
      const mockBeneficiary = { id: 1, uuid: 'ben-uuid-123', name: 'John Doe' };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );

      const result = await service.findOne(payload);

      expect(result).toEqual({ extra: 'extraData', ...mockBeneficiary });
      expect(
        mockPrismaService.rsclient.beneficiary.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid: payload.uuid },
      });
    });

    it('should find one beneficiary without data merge', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const mockBeneficiary = { id: 1, uuid: 'ben-uuid-123', name: 'John Doe' };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );

      const result = await service.findOne(payload);

      expect(result).toEqual(mockBeneficiary);
    });
  });

  describe('findOneBeneficiary', () => {
    it('should find one beneficiary and send to client', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const mockBeneficiary = { id: 1, uuid: 'ben-uuid-123', name: 'John Doe' };
      const mockClientResponse = of({
        ...mockBeneficiary,
        extraData: 'fromClient',
      });

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockClientProxy.send.mockReturnValue(mockClientResponse);

      const result = await service.findOneBeneficiary(payload);

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.find_one_beneficiary' },
        mockBeneficiary
      );
    });
  });

  describe('findOneBeneficiaryByWalletAddress', () => {
    it('should find beneficiary by wallet address', async () => {
      const walletAddress = 'wallet-address-123';
      const mockBeneficiary = { id: 1, walletAddress, name: 'John Doe' };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );

      const result = await service.findOneBeneficiaryByWalletAddress(
        walletAddress
      );

      expect(result).toEqual(mockBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.findUnique
      ).toHaveBeenCalledWith({
        where: { walletAddress },
      });
    });
  });

  describe('update', () => {
    it('should update beneficiary and emit event', async () => {
      const id = 1;
      const updateDto: UpdateBeneficiaryDto = {
        id,
        name: 'Updated Name',
        phone: '+9876543210',
      };
      const mockUpdatedBeneficiary = { id, ...updateDto };

      mockPrismaService.rsclient.beneficiary.update.mockResolvedValue(
        mockUpdatedBeneficiary
      );

      const result = await service.update(id, updateDto);

      expect(result).toEqual(mockUpdatedBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.update
      ).toHaveBeenCalledWith({
        where: { id },
        data: updateDto,
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.BENEFICIARY_UPDATED
      );
    });
  });

  describe('remove', () => {
    it('should soft delete beneficiary and emit event', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const mockBeneficiary = { id: 1, uuid: 'ben-uuid-123', name: 'John Doe' };
      const mockUpdatedBeneficiary = {
        ...mockBeneficiary,
        deletedAt: new Date(),
      };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.rsclient.beneficiary.update.mockResolvedValue(
        mockUpdatedBeneficiary
      );

      const result = await service.remove(payload);

      expect(result).toEqual(mockUpdatedBeneficiary);
      expect(
        mockPrismaService.rsclient.beneficiary.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid: payload.uuid },
      });
      expect(
        mockPrismaService.rsclient.beneficiary.update
      ).toHaveBeenCalledWith({
        where: { uuid: payload.uuid },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.BENEFICIARY_REMOVED
      );
    });

    it('should return OK if beneficiary not found for removal', async () => {
      const payload = { uuid: 'non-existent-uuid' };

      mockPrismaService.rsclient.beneficiary.findUnique.mockResolvedValue(null);

      const result = await service.remove(payload);

      expect(result).toBe('OK');
      expect(
        mockPrismaService.rsclient.beneficiary.update
      ).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getOneGroup', () => {
    it('should get one beneficiary group with token calculations', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000' as any;
      const mockGroup = {
        id: 1,
        uuid,
        name: 'Test Group',
        tokensReserved: {
          numberOfTokens: 1000,
        },
        beneficiaries: [
          { beneficiary: { id: 1, name: 'Ben 1' } },
          { beneficiary: { id: 2, name: 'Ben 2' } },
        ],
      };

      const mockClientResponse = {
        uuid,
        groupedBeneficiaries: [
          { id: 1, name: 'Ben 1' },
          { id: 2, name: 'Ben 2' },
        ],
      };

      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
        mockGroup
      );
      mockClientProxy.send.mockReturnValue(of(mockClientResponse));

      const result = await service.getOneGroup(uuid);

      expect(
        mockPrismaService.beneficiaryGroups.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid, deletedAt: null },
        include: {
          tokensReserved: true,
          beneficiaries: {
            include: {
              beneficiary: true,
            },
          },
        },
      });

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.get_one_group_by_project' },
        uuid
      );
    });

    it('should throw RpcException when group not found', async () => {
      const uuid = '987fcdeb-51d2-43a7-b789-123456789abc' as any;

      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(null);

      await expect(service.getOneGroup(uuid)).rejects.toThrow(
        new RpcException('Beneficiary group not found.')
      );
    });

    it('should handle group without token reservation', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174001' as any;
      const mockGroup = {
        id: 1,
        uuid,
        name: 'Test Group',
        tokensReserved: null,
        beneficiaries: [],
      };

      const mockClientResponse = {
        uuid,
        groupedBeneficiaries: [],
      };

      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
        mockGroup
      );
      mockClientProxy.send.mockReturnValue(of(mockClientResponse));

      const result = await service.getOneGroup(uuid);

      expect(result).toBeDefined();
    });
  });

  describe('getAllGroupsByUuids', () => {
    it('should fetch groups by UUIDs without select fields', async () => {
      const payload = {
        uuids: [
          '123e4567-e89b-12d3-a456-426614174000',
          '123e4567-e89b-12d3-a456-426614174001',
        ],
        selectField: undefined,
      };
      const mockGroups = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Group 1',
          description: 'Description 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          uuid: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Group 2',
          description: 'Description 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(
        mockGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith(
        {
          where: {
            uuid: {
              in: [
                '123e4567-e89b-12d3-a456-426614174000',
                '123e4567-e89b-12d3-a456-426614174001',
              ],
            },
          },
        }
      );
      expect(result).toEqual(mockGroups);
    });

    it('should fetch groups by UUIDs with select fields', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: ['uuid', 'name'],
      };
      const mockSelectedGroups = [
        { uuid: '123e4567-e89b-12d3-a456-426614174000', name: 'Group 1' },
      ];

      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(
        mockSelectedGroups
      );

      const result = await service.getAllGroupsByUuids(payload);

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith(
        {
          where: {
            uuid: {
              in: ['123e4567-e89b-12d3-a456-426614174000'],
            },
          },
          select: {
            uuid: true,
            name: true,
          },
        }
      );
      expect(result).toEqual(mockSelectedGroups);
    });

    it('should return empty array when no groups found', async () => {
      const payload = {
        uuids: ['non-existent-uuid'],
        selectField: undefined,
      };

      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids(payload);

      expect(result).toEqual([]);
    });

    it('should handle empty UUIDs array', async () => {
      const payload = {
        uuids: [],
        selectField: undefined,
      };

      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsByUuids(payload);

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith(
        {
          where: {
            uuid: {
              in: [],
            },
          },
        }
      );
      expect(result).toEqual([]);
    });

    it('should handle empty select fields array', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: [],
      };
      const mockGroup = [
        {
          id: 1,
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Group',
        },
      ];

      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue(mockGroup);

      const result = await service.getAllGroupsByUuids(payload);

      expect(mockPrismaService.beneficiaryGroups.findMany).toHaveBeenCalledWith(
        {
          where: {
            uuid: {
              in: ['123e4567-e89b-12d3-a456-426614174000'],
            },
          },
        }
      );
      expect(result).toEqual(mockGroup);
    });

    it('should throw RpcException when database error occurs', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };

      mockPrismaService.beneficiaryGroups.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(service.getAllGroupsByUuids(payload)).rejects.toThrow(
        new RpcException(
          'Error while fetching beneficiary groups by uuids. Database connection failed'
        )
      );
    });

    it('should throw RpcException with generic message when error has no message', async () => {
      const payload = {
        uuids: ['123e4567-e89b-12d3-a456-426614174000'],
        selectField: undefined,
      };

      mockPrismaService.beneficiaryGroups.findMany.mockRejectedValue(
        new Error()
      );

      await expect(service.getAllGroupsByUuids(payload)).rejects.toThrow(
        new RpcException('Error while fetching beneficiary groups by uuids. ')
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty data in createMany', async () => {
      const emptyData: any[] = [];
      const mockResult = { count: 0 };

      mockPrismaService.rsclient.beneficiary.createMany.mockResolvedValue(
        mockResult
      );

      const result = await service.createMany(emptyData);

      expect(result).toEqual(mockResult);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.BENEFICIARY_CREATED
      );
    });

    it('should handle beneficiary redeem with null values', async () => {
      const beneficiaryUUID = 'ben-uuid-123';
      const mockBeneficiary = { walletAddress: 'wallet-address-123' };
      const mockRedeemRecords = [
        {
          beneficiaryWalletAddress: 'wallet-address-123',
          amount: 100,
          transactionType: 'VOUCHER',
          status: 'PENDING',
          txHash: null,
        },
      ];

      mockPrismaService.beneficiary.findUnique.mockResolvedValue(
        mockBeneficiary
      );
      mockPrismaService.beneficiaryRedeem.findMany.mockResolvedValue(
        mockRedeemRecords
      );

      const result = await service.getBeneficiaryRedeemInfo(beneficiaryUUID);

      expect(result[0].txHash).toBeNull();
    });

    it('should handle error in findByUUID', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174002' as any;
      const error = new Error('Database error');

      mockPrismaService.rsclient.beneficiary.findUnique.mockRejectedValue(
        error
      );

      await expect(service.findByUUID(uuid)).rejects.toThrow(error);
    });

    it('should handle error in update', async () => {
      const id = 1;
      const updateDto: UpdateBeneficiaryDto = { id, name: 'Updated Name' };
      const error = new Error('Update failed');

      mockPrismaService.rsclient.beneficiary.update.mockRejectedValue(error);

      await expect(service.update(id, updateDto)).rejects.toThrow(error);
    });
  });

  describe('addGroupToProject', () => {
    it('should add group to project and create beneficiary mappings', async () => {
      const payload = {
        beneficiaryGroupData: {
          id: 1,
          uuid: 'group-123',
          name: 'Test Group',
          groupPurpose: GroupPurpose.BANK_TRANSFER,
          groupedBeneficiaries: [
            {
              id: 1,
              uuid: 'benf-1',
              beneficiaryGroupId: 'group-123',
              beneficiaryId: 'benf-id-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
            },
          ],
        },
      };

      const mockGroup = { id: 1, uuid: 'group-123', name: 'Test Group' };
      const mockGroupedBeneficiaries = { count: 1 };

      mockPrismaService.beneficiaryGroups.create.mockResolvedValue(mockGroup);
      mockPrismaService.beneficiaryToGroup.createMany.mockResolvedValue(
        mockGroupedBeneficiaries
      );

      const result = await service.addGroupToProject(payload);

      expect(result).toEqual({
        group: mockGroup,
        groupedBeneficiaries: mockGroupedBeneficiaries,
      });

      expect(mockPrismaService.beneficiaryGroups.create).toHaveBeenCalledWith({
        data: {
          uuid: 'group-123',
          name: 'Test Group',
          groupPurpose: GroupPurpose.BANK_TRANSFER,
        },
      });

      expect(
        mockPrismaService.beneficiaryToGroup.createMany
      ).toHaveBeenCalledWith({
        data: [
          {
            beneficiaryId: 'benf-id-1',
            groupId: 'group-123',
          },
        ],
      });
    });
  });

  describe('reserveTokenToGroup', () => {
    it('should reserve tokens to group successfully when no wallets have tokens assigned', async () => {
      const payload = {
        beneficiaryGroupId: 'group-123',
        numberOfTokens: 100,
        totalTokensReserved: 1000,
        title: 'Test Token Reservation',
        user: { name: 'Admin User' },
      };

      const mockGroup = {
        groupedBeneficiaries: [
          {
            Beneficiary: {
              uuid: 'benf-1',
              walletAddress: 'WALLET-1',
            },
          },
          {
            Beneficiary: {
              uuid: 'benf-2',
              walletAddress: 'WALLET-2',
            },
          },
        ],
      };

      const mockBenfGroup = {
        uuid: 'group-123',
        name: 'Test Group',
        groupPurpose: GroupPurpose.BANK_TRANSFER,
      };

      // Mock DB calls
      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        null
      ); // No token reserved yet
      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
        mockBenfGroup
      );

      // No beneficiaries already assigned to tokens
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([]);

      // Transaction mock
      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback()
      );

      // Mock getOneGroup method
      jest.spyOn(service, 'getOneGroup').mockResolvedValue(mockGroup);

      mockPrismaService.beneficiaryGroupTokens.create.mockResolvedValue({
        id: 1,
        title: 'Test Token Reservation',
      });

      const result = await service.reserveTokenToGroup(payload);

      // Assertions
      expect(
        mockPrismaService.beneficiaryGroupTokens.findUnique
      ).toHaveBeenCalledWith({
        where: { groupId: 'group-123' },
      });

      expect(
        mockPrismaService.beneficiaryGroups.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid: 'group-123' },
      });

      expect(
        mockPrismaService.beneficiaryGroups.findMany
      ).toHaveBeenCalledTimes(2); // For both beneficiaries
      expect(
        mockPrismaService.beneficiaryGroupTokens.create
      ).toHaveBeenCalledWith({
        data: {
          title: 'Test Token Reservation',
          groupId: 'group-123',
          numberOfTokens: 1000,
          createdBy: 'Admin User',
        },
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(EVENTS.TOKEN_RESERVED);

      expect(result).toEqual({
        status: 'success',
        message: `Successfully reserved 1000 tokens for group Test Group.`,
        group: mockGroup,
      });
    });

    it('should throw error if token already reserved', async () => {
      const payload = {
        beneficiaryGroupId: 'group-123',
        numberOfTokens: 100,
        totalTokensReserved: 1000,
        title: 'Test Token Reservation',
        user: { name: 'Admin User' },
      };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue({
        id: 1,
      });

      await expect(service.reserveTokenToGroup(payload)).rejects.toThrow(
        new RpcException('Token already reserved.')
      );
    });

    it('should throw error if beneficiary group not found', async () => {
      const payload = {
        beneficiaryGroupId: 'non-existent',
        numberOfTokens: 100,
        totalTokensReserved: 1000,
        title: 'Test Token Reservation',
        user: { name: 'Admin User' },
      };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        null
      );
      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(null);

      await expect(service.reserveTokenToGroup(payload)).rejects.toThrow(
        new RpcException('Beneficiary group not found.')
      );
    });

    it('should throw error for invalid group purpose', async () => {
      const payload = {
        beneficiaryGroupId: 'group-123',
        numberOfTokens: 100,
        totalTokensReserved: 1000,
        title: 'Test Token Reservation',
        user: { name: 'Admin User' },
      };

      const mockBenfGroup = {
        uuid: 'group-123',
        groupPurpose: GroupPurpose.COMMUNICATION,
      };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        null
      );
      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
        mockBenfGroup
      );

      await expect(service.reserveTokenToGroup(payload)).rejects.toThrow(
        new RpcException(
          'Invalid group purpose COMMUNICATION. Only BANK_TRANSFER and MOBILE_MONEY are allowed.'
        )
      );
    });

    it('should return error when some beneficiaries already have tokens assigned', async () => {
      const payload = {
        beneficiaryGroupId: 'group-123',
        numberOfTokens: 100,
        totalTokensReserved: 1000,
        title: 'Test Token Reservation',
        user: { name: 'Admin User' },
      };

      const mockGroup = {
        groupedBeneficiaries: [
          {
            Beneficiary: {
              uuid: 'benf-1',
              walletAddress: 'WALLET-1',
            },
          },
        ],
      };

      const mockBenfGroup = {
        uuid: 'group-123',
        name: 'Test Group',
        groupPurpose: GroupPurpose.BANK_TRANSFER,
      };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        null
      );
      mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
        mockBenfGroup
      );
      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback()
      );
      jest.spyOn(service, 'getOneGroup').mockResolvedValue(mockGroup);

      // Simulate beneficiary already in a group with tokens reserved
      mockPrismaService.beneficiaryGroups.findMany.mockResolvedValue([{}]);

      const result = await service.reserveTokenToGroup(payload);

      expect(result.status).toBe('error');
      expect(result.wallets).toEqual(['WALLET-1']);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getAllTokenReservations', () => {
    it('should get all token reservations with pagination', async () => {
      const dto = {
        page: 1,
        perPage: 20,
        sort: 'createdAt',
        order: 'desc' as const,
      };

      const mockTokenReservations = [
        { id: 1, groupId: 'group-1', title: 'Reservation 1' },
        { id: 2, groupId: 'group-2', title: 'Reservation 2' },
      ];

      const mockPaginatedResult = {
        data: mockTokenReservations,
        meta: { total: 2, page: 1, perPage: 20 },
      };

      const mockGroupData = { groupedBeneficiaries: [] };

      Object.assign(mockPrismaService.beneficiaryGroupTokens, {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue(mockTokenReservations),
      });

      jest.spyOn(service, 'getOneGroup').mockResolvedValue(mockGroupData);

      const result = await service.getAllTokenReservations(dto);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 2,
          perPage: 20,
          currentPage: 1,
        })
      );
      expect(result.data[0]).toHaveProperty('group');
    });
  });

  describe('getOneTokenReservation', () => {
    it('should get one token reservation with group details', async () => {
      const payload = { uuid: 'token-res-123' };
      const mockTokenReservation = {
        id: 1,
        uuid: 'token-res-123',
        groupId: 'group-123',
        title: 'Test Reservation',
      };
      const mockGroupDetails = { name: 'Test Group', beneficiaries: [] };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        mockTokenReservation
      );
      jest.spyOn(service, 'getOneGroup').mockResolvedValue(mockGroupDetails);

      const result = await service.getOneTokenReservation(payload);

      expect(result).toEqual({
        ...mockTokenReservation,
        ...mockGroupDetails,
      });

      expect(
        mockPrismaService.beneficiaryGroupTokens.findUnique
      ).toHaveBeenCalledWith({
        where: { uuid: 'token-res-123' },
      });
    });
  });

  describe('getOneTokenReservationByGroupId', () => {
    it('should get token reservation by group ID', async () => {
      const groupId = 'group-123';
      const mockTokenReservation = {
        id: 1,
        groupId: 'group-123',
        title: 'Test Reservation',
        beneficiaryGroup: { id: 10, name: 'Test Group' },
      };

      mockPrismaService.beneficiaryGroupTokens.findUnique.mockResolvedValue(
        mockTokenReservation
      );

      const result = await service.getOneTokenReservationByGroupId(groupId);

      expect(result).toEqual(mockTokenReservation);
      expect(
        mockPrismaService.beneficiaryGroupTokens.findUnique
      ).toHaveBeenCalledWith({
        where: { groupId },
        include: { beneficiaryGroup: true },
      });
    });
  });

  describe('getReservationStats', () => {
    it('should get reservation statistics', async () => {
      const payload = {};
      const mockAggregateResult = {
        _sum: { benTokens: 5000 },
      };

      mockPrismaService.beneficiary.aggregate.mockResolvedValue(
        mockAggregateResult
      );

      const result = await service.getReservationStats(payload);

      expect(result).toEqual({
        totalReservedTokens: mockAggregateResult,
      });

      expect(mockPrismaService.beneficiary.aggregate).toHaveBeenCalledWith({
        _sum: { benTokens: true },
      });
    });
  });

  describe('assignToken', () => {
    it('should assign tokens in batches', async () => {
      const mockCount = 150;
      const mockBatches = [
        { size: 50, start: 1, end: 50 },
        { size: 50, start: 51, end: 100 },
        { size: 50, start: 101, end: 150 },
      ];

      jest.spyOn(service, 'getCount').mockResolvedValue(mockCount);
      jest.spyOn(service, 'createBatches').mockReturnValue(mockBatches);

      await service.assignToken();

      expect(service.createBatches).toHaveBeenCalledWith(mockCount, 50);
      expect(contractQueue.add).toHaveBeenCalledTimes(3);

      mockBatches.forEach((batch) => {
        expect(contractQueue.add).toHaveBeenCalledWith(
          JOBS.PAYOUT.ASSIGN_TOKEN,
          batch,
          expect.objectContaining({
            attempts: 3,
            removeOnComplete: true,
            backoff: expect.objectContaining({
              type: 'exponential',
              delay: 1000,
            }),
          })
        );
      });
    });

    it('should handle zero count gracefully', async () => {
      jest.spyOn(service, 'getCount').mockResolvedValue(0);
      jest.spyOn(service, 'createBatches').mockReturnValue([]);

      await service.assignToken();

      expect(contractQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('updateGroupToken', () => {
    it('should update group token successfully', async () => {
      const payload = {
        groupUuid: 'group-123',
        title: 'Updated Title',
        numberOfTokens: 2000,
        status: 'ACTIVE' as any,
        isDisbursed: false,
      };

      const mockUpdatedToken = {
        uuid: 'token-123',
        title: 'Updated Title',
        numberOfTokens: 2000,
        updatedAt: new Date(),
      };

      mockPrismaService.beneficiaryGroupTokens.update.mockResolvedValue(
        mockUpdatedToken
      );

      const result = await service.updateGroupToken(payload);

      expect(result).toEqual(mockUpdatedToken);
      expect(
        mockPrismaService.beneficiaryGroupTokens.update
      ).toHaveBeenCalledWith({
        where: { groupId: 'group-123' },
        data: {
          title: 'Updated Title',
          numberOfTokens: 2000,
          status: 'ACTIVE',
          isDisbursed: false,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle update errors and re-throw', async () => {
      const payload = {
        groupUuid: 'group-123',
        title: 'Updated Title',
        status: 'ACTIVE' as any,
        isDisbursed: false,
      };

      const error = new Error('Update failed');
      mockPrismaService.beneficiaryGroupTokens.update.mockRejectedValue(error);

      await expect(service.updateGroupToken(payload)).rejects.toThrow(error);
    });
  });

  describe('createBatches', () => {
    it('should create correct batches for given total and batch size', () => {
      const result = service.createBatches(100, 30);

      expect(result).toEqual([
        { size: 30, start: 1, end: 30 },
        { size: 30, start: 31, end: 60 },
        { size: 30, start: 61, end: 90 },
        { size: 10, start: 91, end: 100 },
      ]);
    });

    it('should handle exact division', () => {
      const result = service.createBatches(100, 25);

      expect(result).toEqual([
        { size: 25, start: 1, end: 25 },
        { size: 25, start: 26, end: 50 },
        { size: 25, start: 51, end: 75 },
        { size: 25, start: 76, end: 100 },
      ]);
    });

    it('should handle single batch', () => {
      const result = service.createBatches(10, 50);

      expect(result).toEqual([{ size: 10, start: 1, end: 10 }]);
    });

    it('should handle custom start value', () => {
      const result = service.createBatches(20, 10, 5);

      expect(result).toEqual([
        { size: 10, start: 5, end: 14 },
        { size: 10, start: 15, end: 24 },
      ]);
    });
  });

  describe('updateBeneficiaryRedeem', () => {
    it('should update beneficiary redeem successfully', async () => {
      const uuid = 'redeem-123';
      const payload = { status: 'COMPLETED', txHash: 'tx-hash-123' } as any;
      const mockUpdatedRedeem = {
        uuid,
        status: 'COMPLETED',
        txHash: 'tx-hash-123',
      };

      mockPrismaService.beneficiaryRedeem.update.mockResolvedValue(
        mockUpdatedRedeem
      );

      const result = await service.updateBeneficiaryRedeem(uuid, payload);

      expect(result).toEqual(mockUpdatedRedeem);
      expect(mockPrismaService.beneficiaryRedeem.update).toHaveBeenCalledWith({
        where: { uuid },
        data: payload,
      });
    });

    it('should handle update errors', async () => {
      const uuid = 'redeem-123';
      const payload = { status: 'FAILED' } as any;
      const error = new Error('Update failed');

      mockPrismaService.beneficiaryRedeem.update.mockRejectedValue(error);

      await expect(
        service.updateBeneficiaryRedeem(uuid, payload)
      ).rejects.toThrow(error);
    });
  });

  describe('updateBeneficiaryRedeemBulk', () => {
    it('should update multiple beneficiary redeems', async () => {
      const uuids = ['redeem-1', 'redeem-2', 'redeem-3'];
      const payload = { status: 'COMPLETED' } as any;
      const mockResult = { count: 3 };

      mockPrismaService.beneficiaryRedeem.updateMany.mockResolvedValue(
        mockResult
      );

      const result = await service.updateBeneficiaryRedeemBulk(uuids, payload);

      expect(result).toEqual(mockResult);
      expect(
        mockPrismaService.beneficiaryRedeem.updateMany
      ).toHaveBeenCalledWith({
        where: { uuid: { in: uuids } },
        data: payload,
      });
    });
  });

  describe('createBeneficiaryRedeem', () => {
    it('should create beneficiary redeem successfully', async () => {
      const payload = {
        beneficiaryWalletAddress: 'wallet-123',
        amount: 100,
        transactionType: 'VOUCHER',
        status: 'PENDING',
        Beneficiary: { connect: { uuid: 'benf-123' } },
      } as any;

      const mockCreatedRedeem = { uuid: 'redeem-123', ...payload };

      mockPrismaService.beneficiaryRedeem.create.mockResolvedValue(
        mockCreatedRedeem
      );

      const result = await service.createBeneficiaryRedeem(payload);

      expect(result).toEqual(mockCreatedRedeem);
      expect(mockPrismaService.beneficiaryRedeem.create).toHaveBeenCalledWith({
        data: payload,
      });
    });

    it('should handle creation errors', async () => {
      const payload = {
        beneficiaryWalletAddress: 'wallet-123',
        amount: 100,
        transactionType: 'VOUCHER',
        status: 'PENDING',
        Beneficiary: { connect: { uuid: 'benf-123' } },
      } as any;

      const error = new Error('Creation failed');
      mockPrismaService.beneficiaryRedeem.create.mockRejectedValue(error);

      await expect(service.createBeneficiaryRedeem(payload)).rejects.toThrow(
        error
      );
    });
  });
});
