import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { OfframpService } from './offramp.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { ListPayoutDto } from './dto/list-payout.dto';
import { PayoutType, PayoutMode } from '@prisma/client';

describe('PayoutsController', () => {
  let controller: PayoutsController;
  let payoutsService: PayoutsService;
  let offrampService: OfframpService;

  const mockPayoutsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn(),
    triggerPayout: jest.fn(),
    triggerOneFailedPayoutRequest: jest.fn(),
    triggerFailedPayoutRequest: jest.fn(),
    getPayoutLogs: jest.fn(),
    getPayoutLog: jest.fn(),
    getPayoutStats: jest.fn(),
    downloadPayoutLogs: jest.fn(),
  };

  const mockOfframpService = {
    getPaymentProvider: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        {
          provide: PayoutsService,
          useValue: mockPayoutsService,
        },
        {
          provide: OfframpService,
          useValue: mockOfframpService,
        },
      ],
    }).compile();

    controller = module.get<PayoutsController>(PayoutsController);
    payoutsService = module.get<PayoutsService>(PayoutsService);
    offrampService = module.get<OfframpService>(OfframpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a payout successfully', async () => {
      const createPayoutDto: CreatePayoutDto = {
        groupId: 'group-uuid-123',
        type: PayoutType.FSP,
        mode: PayoutMode.ONLINE,
        payoutProcessorId: 'processor-123',
        status: 'PENDING',
      };

      const expectedResult = {
        uuid: 'payout-uuid-123',
        type: PayoutType.FSP,
        mode: PayoutMode.ONLINE,
        status: 'PENDING',
      };

      mockPayoutsService.create.mockResolvedValue(expectedResult);

      const result = await controller.create(createPayoutDto);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.create).toHaveBeenCalledWith(createPayoutDto);
    });

    it('should handle service errors in create', async () => {
      const createPayoutDto: CreatePayoutDto = {
        groupId: 'invalid-group',
        type: PayoutType.FSP,
        mode: PayoutMode.ONLINE,
        payoutProcessorId: 'processor-123',
      };

      const error = new Error('Group not found');
      mockPayoutsService.create.mockRejectedValue(error);

      await expect(controller.create(createPayoutDto)).rejects.toThrow('Group not found');
    });
  });

  describe('findAll', () => {
    it('should return paginated list of payouts', async () => {
      const listPayoutDto: ListPayoutDto = {
        page: 1,
        perPage: 10,
        payoutType: 'FSP',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'payout-1',
            type: PayoutType.FSP,
            status: 'PENDING',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          perPage: 10,
        },
      };

      mockPayoutsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(listPayoutDto);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.findAll).toHaveBeenCalledWith(listPayoutDto);
    });

    it('should handle empty payload in findAll', async () => {
      const listPayoutDto: ListPayoutDto = {};

      const expectedResult = {
        data: [],
        meta: { total: 0, page: 1, perPage: 10 },
      };

      mockPayoutsService.findAll.mockResolvedValue(expectedResult);

      const result = await controller.findAll(listPayoutDto);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.findAll).toHaveBeenCalledWith(listPayoutDto);
    });
  });

  describe('findOne', () => {
    it('should return a single payout by uuid', async () => {
      const payload = { uuid: 'payout-uuid-123' };
      const expectedResult = {
        uuid: 'payout-uuid-123',
        type: PayoutType.FSP,
        status: 'PENDING',
      };

      mockPayoutsService.getOne.mockResolvedValue(expectedResult);

      const result = await controller.findOne(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.getOne).toHaveBeenCalledWith('payout-uuid-123');
    });

    it('should handle non-existent payout in findOne', async () => {
      const payload = { uuid: 'non-existent-uuid' };
      const error = new Error('Payout not found');

      mockPayoutsService.getOne.mockRejectedValue(error);

      await expect(controller.findOne(payload)).rejects.toThrow('Payout not found');
    });
  });

  describe('update', () => {
    it('should update payout successfully', async () => {
      const updatePayoutDto: UpdatePayoutDto & { uuid: string } = {
        uuid: 'payout-uuid-123',
        status: 'COMPLETED',
        extras: { note: 'Payout completed' },
      };

      const expectedResult = {
        uuid: 'payout-uuid-123',
        status: 'COMPLETED',
        extras: { note: 'Payout completed' },
      };

      mockPayoutsService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(updatePayoutDto);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.update).toHaveBeenCalledWith(
        'payout-uuid-123',
        updatePayoutDto
      );
    });

    it('should handle update errors', async () => {
      const updatePayoutDto: UpdatePayoutDto & { uuid: string } = {
        uuid: 'invalid-uuid',
        status: 'COMPLETED',
      };

      const error = new Error('Payout not found');
      mockPayoutsService.update.mockRejectedValue(error);

      await expect(controller.update(updatePayoutDto)).rejects.toThrow('Payout not found');
    });
  });

  describe('getPaymentProviders', () => {
    it('should return payment providers', async () => {
      const expectedResult = [
        { id: '1', name: 'Provider 1', type: 'bank' },
        { id: '2', name: 'Provider 2', type: 'mobile' },
      ];

      mockOfframpService.getPaymentProvider.mockResolvedValue(expectedResult);

      const result = await controller.getPaymentProviders();

      expect(result).toEqual(expectedResult);
      expect(mockOfframpService.getPaymentProvider).toHaveBeenCalled();
    });

    it('should handle errors in getPaymentProviders', async () => {
      const error = new Error('Failed to fetch providers');
      mockOfframpService.getPaymentProvider.mockRejectedValue(error);

      await expect(controller.getPaymentProviders()).rejects.toThrow(
        'Failed to fetch providers'
      );
    });
  });

  describe('triggerPayout', () => {
    it('should trigger payout successfully', async () => {
      const payload = { uuid: 'payout-uuid-123' };
      const expectedResult = { success: true, message: 'Payout triggered' };

      mockPayoutsService.triggerPayout.mockResolvedValue(expectedResult);

      const result = await controller.triggerPayout(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.triggerPayout).toHaveBeenCalledWith('payout-uuid-123');
    });

    it('should handle trigger payout errors', async () => {
      const payload = { uuid: 'invalid-uuid' };
      const error = new Error('Payout not found');

      mockPayoutsService.triggerPayout.mockRejectedValue(error);

      await expect(controller.triggerPayout(payload)).rejects.toThrow('Payout not found');
    });
  });

  describe('triggerOneFailedPayoutRequest', () => {
    it('should trigger one failed payout request successfully', async () => {
      const payload = { beneficiaryRedeemUuid: 'redeem-uuid-123' };
      const expectedResult = { success: true, message: 'Failed payout retriggered' };

      mockPayoutsService.triggerOneFailedPayoutRequest.mockResolvedValue(expectedResult);

      const result = await controller.triggerOneFailedPayoutRequest(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.triggerOneFailedPayoutRequest).toHaveBeenCalledWith(payload);
    });

    it('should handle errors in triggerOneFailedPayoutRequest', async () => {
      const payload = { beneficiaryRedeemUuid: 'invalid-uuid' };
      const error = new Error('Redeem not found');

      mockPayoutsService.triggerOneFailedPayoutRequest.mockRejectedValue(error);

      await expect(controller.triggerOneFailedPayoutRequest(payload)).rejects.toThrow(
        'Redeem not found'
      );
    });
  });

  describe('triggerFailedPayoutRequest', () => {
    it('should trigger failed payout request successfully', async () => {
      const payload = { payoutUUID: 'payout-uuid-123' };
      const expectedResult = { success: true, message: 'Failed payouts retriggered' };

      mockPayoutsService.triggerFailedPayoutRequest.mockResolvedValue(expectedResult);

      const result = await controller.triggerFailedPayoutRequest(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.triggerFailedPayoutRequest).toHaveBeenCalledWith(payload);
    });

    it('should handle errors in triggerFailedPayoutRequest', async () => {
      const payload = { payoutUUID: 'invalid-uuid' };
      const error = new Error('Payout not found');

      mockPayoutsService.triggerFailedPayoutRequest.mockRejectedValue(error);

      await expect(controller.triggerFailedPayoutRequest(payload)).rejects.toThrow(
        'Payout not found'
      );
    });
  });

  describe('getPayoutLogs', () => {
    it('should return payout logs successfully', async () => {
      const payload: GetPayoutLogsDto = {
        payoutUUID: 'payout-uuid-123',
        page: 1,
        perPage: 10,
        sort: 'createdAt',
        order: 'desc',
      };

      const expectedResult = {
        data: [
          {
            uuid: 'log-1',
            payoutUUID: 'payout-uuid-123',
            status: 'COMPLETED',
          },
        ],
        meta: { total: 1, page: 1, perPage: 10 },
      };

      mockPayoutsService.getPayoutLogs.mockResolvedValue(expectedResult);

      const result = await controller.getPayoutLogs(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.getPayoutLogs).toHaveBeenCalledWith(payload);
    });

    it('should handle errors in getPayoutLogs', async () => {
      const payload: GetPayoutLogsDto = {
        payoutUUID: 'invalid-uuid',
        page: 1,
        perPage: 10,
        sort: 'createdAt',
        order: 'asc',
      };

      const error = new Error('Logs not found');
      mockPayoutsService.getPayoutLogs.mockRejectedValue(error);

      await expect(controller.getPayoutLogs(payload)).rejects.toThrow('Logs not found');
    });
  });

  describe('getPayoutLog', () => {
    it('should return single payout log successfully', async () => {
      const payload = { uuid: 'log-uuid-123' };
      const expectedResult = {
        uuid: 'log-uuid-123',
        status: 'COMPLETED',
        amount: 1000,
      };

      mockPayoutsService.getPayoutLog.mockResolvedValue(expectedResult);

      const result = await controller.getPayoutLog(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.getPayoutLog).toHaveBeenCalledWith('log-uuid-123');
    });

    it('should handle errors in getPayoutLog', async () => {
      const payload = { uuid: 'invalid-uuid' };
      const error = new Error('Log not found');

      mockPayoutsService.getPayoutLog.mockRejectedValue(error);

      await expect(controller.getPayoutLog(payload)).rejects.toThrow('Log not found');
    });
  });

  describe('getPayoutStats', () => {
    it('should return payout statistics successfully', async () => {
      const expectedResult = {
        payoutOverview: {
          payoutTypes: { FSP: 10, VENDOR: 5 },
          payoutStatus: { SUCCESS: 15, FAILED: 2 },
        },
        payoutStats: {
          beneficiaries: 100,
          totalCashDistribution: 50000,
        },
      };

      mockPayoutsService.getPayoutStats.mockResolvedValue(expectedResult);

      const result = await controller.getPayoutStats();

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.getPayoutStats).toHaveBeenCalled();
    });

    it('should handle errors in getPayoutStats', async () => {
      const error = new Error('Failed to fetch stats');
      mockPayoutsService.getPayoutStats.mockRejectedValue(error);

      await expect(controller.getPayoutStats()).rejects.toThrow('Failed to fetch stats');
    });
  });

  describe('downloadPayoutLogs', () => {
    it('should download payout logs successfully', async () => {
      const payload = { uuid: 'payout-uuid-123' };
      const expectedResult = [
        {
          beneficiaryName: 'John Doe',
          beneficiaryWallet: 'wallet-1',
          amount: 1000,
          status: 'COMPLETED',
        },
      ];

      mockPayoutsService.downloadPayoutLogs.mockResolvedValue(expectedResult);

      const result = await controller.downloadPayoutLogs(payload);

      expect(result).toEqual(expectedResult);
      expect(mockPayoutsService.downloadPayoutLogs).toHaveBeenCalledWith('payout-uuid-123');
    });

    it('should handle errors in downloadPayoutLogs', async () => {
      const payload = { uuid: 'invalid-uuid' };
      const error = new Error('Logs not found');

      mockPayoutsService.downloadPayoutLogs.mockRejectedValue(error);

      await expect(controller.downloadPayoutLogs(payload)).rejects.toThrow('Logs not found');
    });
  });
}); 