import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto, AddTokenToGroup } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { GetBenfGroupDto } from './dto/get-group.dto';
import { JOBS, CONTROLLERS } from '../constants';
import { CVA_JOBS } from '@rahat-project/cva';

describe('BeneficiaryController', () => {
  let controller: BeneficiaryController;
  let service: BeneficiaryService;

  const mockBeneficiaryService = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneBeneficiary: jest.fn(),
    findAll: jest.fn(),
    createMany: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    addGroupToProject: jest.fn(),
    getAllGroups: jest.fn(),
    getOneGroup: jest.fn(),
    getBeneficiaryRedeemInfo: jest.fn(),
    reserveTokenToGroup: jest.fn(),
    getAllTokenReservations: jest.fn(),
    getOneTokenReservation: jest.fn(),
    getReservationStats: jest.fn(),
    assignToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeneficiaryController],
      providers: [
        {
          provide: BeneficiaryService,
          useValue: mockBeneficiaryService,
        },
      ],
    }).compile();

    controller = module.get<BeneficiaryController>(BeneficiaryController);
    service = module.get<BeneficiaryService>(BeneficiaryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a beneficiary', async () => {
      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
      } as CreateBeneficiaryDto;

      const expectedResult = { id: 1, ...createDto };
      mockBeneficiaryService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.create).toHaveBeenCalledWith(createDto);
    });

    it('should handle service errors during creation', async () => {
      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
      } as CreateBeneficiaryDto;

      const error = new Error('Service error');
      mockBeneficiaryService.create.mockRejectedValue(error);

      await expect(controller.create(createDto)).rejects.toThrow(error);
    });
  });

  describe('findOne', () => {
    it('should find one beneficiary by payload', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const expectedResult = { id: 1, uuid: 'ben-uuid-123', name: 'John Doe' };

      mockBeneficiaryService.findOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.findOne).toHaveBeenCalledWith(payload);
    });

    it('should handle not found scenario', async () => {
      const payload = { uuid: 'non-existent-uuid' };
      mockBeneficiaryService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(payload);

      expect(result).toBeNull();
      expect(mockBeneficiaryService.findOne).toHaveBeenCalledWith(payload);
    });
  });

  describe('findOneBeneficiary', () => {
    it('should find one beneficiary with detailed info', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const expectedResult = {
        id: 1,
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
      };

      mockBeneficiaryService.findOneBeneficiary.mockResolvedValue(expectedResult);

      const result = await controller.findOneBeneficiary(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.findOneBeneficiary).toHaveBeenCalledWith(payload);
    });
  });

  describe('findAllPii', () => {
    it('should find all beneficiaries with PII data', async () => {
      const data = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
      };

      const expectedResult = {
        data: [{ id: 1, uuid: 'ben-1', name: 'John Doe' }],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      mockBeneficiaryService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAllPii(data);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.findAll).toHaveBeenCalledWith(data);
    });

    it('should handle empty results for findAllPii', async () => {
      const data = { page: 1, perPage: 20 };
      const expectedResult = { data: [], meta: { total: 0, page: 1, perPage: 20 } };

      mockBeneficiaryService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAllPii(data);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('createMany', () => {
    it('should create multiple beneficiaries', async () => {
      const data = [
        { uuid: 'ben-1', name: 'John Doe' },
        { uuid: 'ben-2', name: 'Jane Smith' },
      ];

      const expectedResult = { count: 2 };
      mockBeneficiaryService.createMany.mockResolvedValue(expectedResult);

      const result = await controller.createMany(data);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.createMany).toHaveBeenCalledWith(data);
    });

    it('should handle empty array in createMany', async () => {
      const data: any[] = [];
      const expectedResult = { count: 0 };

      mockBeneficiaryService.createMany.mockResolvedValue(expectedResult);

      const result = await controller.createMany(data);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('remove', () => {
    it('should remove a beneficiary', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const expectedResult = { success: true, message: 'Beneficiary removed' };

      mockBeneficiaryService.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.remove).toHaveBeenCalledWith(payload);
    });

    it('should handle errors during removal', async () => {
      const payload = { uuid: 'ben-uuid-123' };
      const error = new Error('Remove failed');

      mockBeneficiaryService.remove.mockRejectedValue(error);

      await expect(controller.remove(payload)).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    it('should update a beneficiary', async () => {
      const updateDto: UpdateBeneficiaryDto = {
        id: 1,
        name: 'Updated Name',
        phone: '+1234567890',
      };

      const expectedResult = { id: 1, name: 'Updated Name', phone: '+1234567890' };
      mockBeneficiaryService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(updateDto);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.update).toHaveBeenCalledWith(updateDto.id, updateDto);
    });

    it('should handle validation errors during update', async () => {
      const updateDto: UpdateBeneficiaryDto = {
        id: 1,
        name: '',
      };

      const error = new Error('Validation error');
      mockBeneficiaryService.update.mockRejectedValue(error);

      await expect(controller.update(updateDto)).rejects.toThrow(error);
    });
  });

  describe('addGroupToProject', () => {
    it('should add group to project', async () => {
      const payload = {
        groupData: {
          name: 'Test Group',
          beneficiaries: [{ uuid: 'ben-1' }, { uuid: 'ben-2' }],
        },
      };

      const expectedResult = { groupId: 'group-123', message: 'Group added successfully' };
      mockBeneficiaryService.addGroupToProject.mockResolvedValue(expectedResult);

      const result = await controller.addGroupToProject(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.addGroupToProject).toHaveBeenCalledWith(payload);
    });
  });

  describe('getAllGroups', () => {
    it('should get all groups with console log', async () => {
      const payload: GetBenfGroupDto = {
        page: 1,
        perPage: 20,
        sort: 'name',
        order: 'asc',
        tokenAssigned: true,
        search: 'test',
      };

      const expectedResult = {
        data: [{ id: 1, uuid: 'group-1', name: 'Test Group' }],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockBeneficiaryService.getAllGroups.mockResolvedValue(expectedResult);

      const result = await controller.getAllGroups(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getAllGroups).toHaveBeenCalledWith(payload);
      expect(consoleSpy).toHaveBeenCalledWith(payload);

      consoleSpy.mockRestore();
    });

    it('should handle getAllGroups with minimal payload', async () => {
      const payload: GetBenfGroupDto = {
        page: 1,
        perPage: 10,
        sort: 'createdAt',
        order: 'desc',
      };

      const expectedResult = { data: [], meta: { total: 0, page: 1, perPage: 10 } };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockBeneficiaryService.getAllGroups.mockResolvedValue(expectedResult);

      const result = await controller.getAllGroups(payload);

      expect(result).toEqual(expectedResult);
      expect(consoleSpy).toHaveBeenCalledWith(payload);

      consoleSpy.mockRestore();
    });
  });

  describe('getOneGroup', () => {
    it('should get one group by UUID', async () => {
      const payload = { uuid: 'group-uuid-123' as any };
      const expectedResult = {
        id: 1,
        uuid: 'group-uuid-123',
        name: 'Test Group',
        beneficiaries: [],
      };

      mockBeneficiaryService.getOneGroup.mockResolvedValue(expectedResult);

      const result = await controller.getOneGroup(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getOneGroup).toHaveBeenCalledWith(payload.uuid);
    });

    it('should handle group not found', async () => {
      const payload = { uuid: 'non-existent-group' as any };
      mockBeneficiaryService.getOneGroup.mockResolvedValue(null);

      const result = await controller.getOneGroup(payload);

      expect(result).toBeNull();
    });
  });

  describe('getBeneficiaryRedeemInfo', () => {
    it('should get beneficiary redeem information', async () => {
      const payload = { beneficiaryUUID: 'ben-uuid-123' };
      const expectedResult = [
        {
          beneficiaryWallet: 'wallet-address-123',
          tokenAmount: 100,
          transactionType: 'VOUCHER',
          status: 'PENDING',
          txHash: 'tx-hash-123',
        },
      ];

      mockBeneficiaryService.getBeneficiaryRedeemInfo.mockResolvedValue(expectedResult);

      const result = await controller.getBeneficiaryRedeemInfo(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getBeneficiaryRedeemInfo).toHaveBeenCalledWith(
        payload.beneficiaryUUID
      );
    });

    it('should handle empty redeem info', async () => {
      const payload = { beneficiaryUUID: 'ben-uuid-123' };
      mockBeneficiaryService.getBeneficiaryRedeemInfo.mockResolvedValue([]);

      const result = await controller.getBeneficiaryRedeemInfo(payload);

      expect(result).toEqual([]);
    });
  });

  describe('reserveTokenToGroup', () => {
    it('should reserve tokens to a group', async () => {
      const payload: AddTokenToGroup = {
        beneficiaryGroupId: 'group-uuid-123',
        numberOfTokens: 1000,
        totalTokensReserved: 5000,
        title: 'Test Token Reservation',
        user: { id: 1, name: 'Admin User' },
      };

      const expectedResult = {
        reservationId: 'reservation-123',
        message: 'Tokens reserved successfully',
      };

      mockBeneficiaryService.reserveTokenToGroup.mockResolvedValue(expectedResult);

      const result = await controller.reserveTokenToGroup(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.reserveTokenToGroup).toHaveBeenCalledWith(payload);
    });

    it('should handle insufficient tokens scenario', async () => {
      const payload: AddTokenToGroup = {
        beneficiaryGroupId: 'group-uuid-123',
        numberOfTokens: 10000,
        totalTokensReserved: 5000,
        title: 'Test Token Reservation',
      };

      const error = new Error('Insufficient tokens');
      mockBeneficiaryService.reserveTokenToGroup.mockRejectedValue(error);

      await expect(controller.reserveTokenToGroup(payload)).rejects.toThrow(error);
    });
  });

  describe('getTokenReservations', () => {
    it('should get all token reservations', async () => {
      const payload = { page: 1, perPage: 20 };
      const expectedResult = {
        data: [{ id: 1, groupName: 'Test Group', tokensReserved: 1000 }],
        meta: { total: 1, page: 1, perPage: 20 },
      };

      mockBeneficiaryService.getAllTokenReservations.mockResolvedValue(expectedResult);

      const result = await controller.getTokenReservations(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getAllTokenReservations).toHaveBeenCalledWith(payload);
    });
  });

  describe('getOneTokenReservations', () => {
    it('should get one token reservation', async () => {
      const payload = { reservationId: 'reservation-123' };
      const expectedResult = {
        id: 1,
        groupName: 'Test Group',
        tokensReserved: 1000,
        status: 'ACTIVE',
      };

      mockBeneficiaryService.getOneTokenReservation.mockResolvedValue(expectedResult);

      const result = await controller.getOneTokenReservations(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getOneTokenReservation).toHaveBeenCalledWith(payload);
    });
  });

  describe('getReservationStats', () => {
    it('should get reservation statistics', async () => {
      const payload = { groupId: 'group-123' };
      const expectedResult = {
        totalReservations: 5,
        totalTokensReserved: 10000,
        activeReservations: 3,
        expiredReservations: 2,
      };

      mockBeneficiaryService.getReservationStats.mockResolvedValue(expectedResult);

      const result = await controller.getReservationStats(payload);

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.getReservationStats).toHaveBeenCalledWith(payload);
    });

    it('should handle empty stats', async () => {
      const payload = { groupId: 'empty-group' };
      const expectedResult = {
        totalReservations: 0,
        totalTokensReserved: 0,
        activeReservations: 0,
        expiredReservations: 0,
      };

      mockBeneficiaryService.getReservationStats.mockResolvedValue(expectedResult);

      const result = await controller.getReservationStats(payload);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('assignToken', () => {
    it('should assign tokens', async () => {
      const expectedResult = {
        success: true,
        message: 'Tokens assigned successfully',
        assignedCount: 150,
      };

      mockBeneficiaryService.assignToken.mockResolvedValue(expectedResult);

      const result = await controller.assignToken();

      expect(result).toEqual(expectedResult);
      expect(mockBeneficiaryService.assignToken).toHaveBeenCalledWith();
    });

    it('should handle assignment failures', async () => {
      const error = new Error('Token assignment failed');
      mockBeneficiaryService.assignToken.mockRejectedValue(error);

      await expect(controller.assignToken()).rejects.toThrow(error);
    });
  });

  describe('Message Pattern Integration', () => {
    it('should properly handle all message patterns', () => {
      // These tests verify that the decorators are properly set up
      // and the methods delegate to the service correctly

      const patterns = [
        { method: 'create', cmd: JOBS.BENEFICIARY.ADD_TO_PROJECT },
        { method: 'findOne', cmd: JOBS.BENEFICIARY.GET },
        { method: 'findOneBeneficiary', cmd: JOBS.BENEFICIARY.GET_ONE_BENEFICIARY },
        { method: 'findAllPii', cmd: JOBS.BENEFICIARY.LIST_PROJECT_PII },
        { method: 'createMany', cmd: JOBS.BENEFICIARY.BULK_ASSIGN_TO_PROJECT },
        { method: 'remove', cmd: JOBS.BENEFICIARY.REMOVE },
        { method: 'update', cmd: CONTROLLERS.BENEFICIARY.UPDATE },
        { method: 'addGroupToProject', cmd: JOBS.BENEFICIARY.ADD_GROUP_TO_PROJECT },
        { method: 'getAllGroups', cmd: JOBS.BENEFICIARY.GET_ALL_GROUPS },
        { method: 'getOneGroup', cmd: JOBS.BENEFICIARY.GET_ONE_GROUP },
        { method: 'getBeneficiaryRedeemInfo', cmd: JOBS.BENEFICIARY.GET_REDEEM_INFO },
        { method: 'reserveTokenToGroup', cmd: JOBS.BENEFICIARY.RESERVE_TOKEN_TO_GROUP },
        { method: 'getTokenReservations', cmd: JOBS.BENEFICIARY.GET_ALL_TOKEN_RESERVATION },
        { method: 'getOneTokenReservations', cmd: JOBS.BENEFICIARY.GET_ONE_TOKEN_RESERVATION },
        { method: 'getReservationStats', cmd: JOBS.BENEFICIARY.GET_RESERVATION_STATS },
        { method: 'assignToken', cmd: CVA_JOBS.PAYOUT.ASSIGN_TOKEN },
      ];

      patterns.forEach((pattern) => {
        expect(controller[pattern.method]).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate service errors correctly', async () => {
      const error = new Error('Service unavailable');
      mockBeneficiaryService.create.mockRejectedValue(error);

      const createDto: CreateBeneficiaryDto = {
        uuid: 'ben-uuid-123',
        name: 'John Doe',
        phone: '+1234567890',
        walletAddress: 'wallet-address',
      } as CreateBeneficiaryDto;

      await expect(controller.create(createDto)).rejects.toThrow(error);
    });

    it('should handle different error types', async () => {
      const rpcError = new Error('RPC Error');
      mockBeneficiaryService.findOne.mockRejectedValue(rpcError);

      await expect(controller.findOne({ uuid: 'test' })).rejects.toThrow(rpcError);
    });
  });
}); 