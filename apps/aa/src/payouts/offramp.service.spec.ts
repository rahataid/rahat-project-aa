import { Test, TestingModule } from '@nestjs/testing';
import { OfframpService } from './offramp.service';
import { HttpService } from '@nestjs/axios';
import { AppService } from '../app/app.service';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { RpcException } from '@nestjs/microservices';
import { IPaymentProvider } from './dto/types';
import { FSPOfframpDetails, FSPPayoutDetails } from '../processors/types';

describe('OfframpService', () => {
  let service: OfframpService;
  let httpService: HttpService;
  let appService: AppService;
  let offrampQueue: Queue;

  const mockHttpService = {
    axiosRef: {
      get: jest.fn(),
      post: jest.fn(),
    },
  };

  const mockAppService = {
    getSettings: jest.fn(),
  };

  const mockOfframpQueue = {
    add: jest.fn(),
    addBulk: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfframpService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: getQueueToken(BQUEUE.OFFRAMP),
          useValue: mockOfframpQueue,
        },
      ],
    }).compile();

    service = module.get<OfframpService>(OfframpService);
    httpService = module.get<HttpService>(HttpService);
    appService = module.get<AppService>(AppService);
    offrampQueue = module.get<Queue>(getQueueToken(BQUEUE.OFFRAMP));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('fetchOfframpSettings', () => {
    it('should fetch offramp settings successfully', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);

      const result = await service.fetchOfframpSettings();

      expect(result).toEqual({
        url: 'https://api.offramp.com',
        appId: 'test-app-id',
        accessToken: 'test-access-token',
      });

      expect(mockAppService.getSettings).toHaveBeenCalledWith({
        name: 'OFFRAMP_SETTINGS',
      });
    });

    it('should throw error when offramp settings not found', async () => {
      mockAppService.getSettings.mockResolvedValue(null);

      await expect(service.fetchOfframpSettings()).rejects.toThrow(
        'Offramp settings not found.'
      );
    });

    it('should throw error when url is missing in settings', async () => {
      const mockSettings = {
        value: {
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);

      await expect(service.fetchOfframpSettings()).rejects.toThrow(
        'Offramp url/Appid/AccessToken not found in settings.'
      );
    });

    it('should throw error when appid is missing in settings', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          accesstoken: 'test-access-token',
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);

      await expect(service.fetchOfframpSettings()).rejects.toThrow(
        'Offramp url/Appid/AccessToken not found in settings.'
      );
    });

    it('should throw error when accesstoken is missing in settings', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);

      await expect(service.fetchOfframpSettings()).rejects.toThrow(
        'Offramp url/Appid/AccessToken not found in settings.'
      );
    });
  });

  describe('getPaymentProvider', () => {
    it('should fetch payment providers successfully', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const mockProviders: IPaymentProvider[] = [
        {
          id: '1',
          name: 'Bank Provider',
          type: 'bank',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          name: 'Mobile Provider',
          type: 'mobile',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
      ];

      const response = [
        ...mockProviders,
        {
            "id": "manual-bank-transfer",
            "name": "Manual Bank Transfer", 
            "type": "manual_bank_transfer",
            "createdAt": "2025-01-27T10:00:00.000Z",
            "updatedAt": "2025-01-27T10:00:00.000Z"
        }
      ]

      const mockApiResponse = {
        data: {
          success: true,
          data: mockProviders,
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.get.mockResolvedValue(mockApiResponse);

      const result = await service.getPaymentProvider();

      expect(result).toHaveLength(response.length);
      expect(result).toEqual(response);
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'https://api.offramp.com/payment-provider',
        {
          headers: {
            APP_ID: 'test-app-id',
          },
        }
      );
    });

    it('should throw error when API call fails', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const error = new Error('Network error');
      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.get.mockRejectedValue(error);

      await expect(service.getPaymentProvider()).rejects.toThrow(
        'Failed to fetch payment provider: Network error'
      );
    });

    it('should handle settings fetch failure', async () => {
      mockAppService.getSettings.mockResolvedValue(null);

      await expect(service.getPaymentProvider()).rejects.toThrow(
        'Offramp settings not found.'
      );
    });
  });

  describe('getOfframpWalletAddress', () => {
    it('should fetch offramp wallet address successfully', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const mockApiResponse = {
        data: {
          success: true,
          data: {
            wallet: 'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          },
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.get.mockResolvedValue(mockApiResponse);

      const result = await service.getOfframpWalletAddress();

      expect(result).toBe('GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(mockHttpService.axiosRef.get).toHaveBeenCalledWith(
        'https://api.offramp.com/app/test-app-id',
        {
          headers: {
            APP_ID: 'test-app-id',
          },
        }
      );
    });

    it('should throw error when wallet address API fails', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const error = new Error('API error');
      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.get.mockRejectedValue(error);

      await expect(service.getOfframpWalletAddress()).rejects.toThrow(
        'Failed to fetch offramp wallet address: API error'
      );
    });
  });

  describe('instantOfframp', () => {
    it('should perform instant offramp successfully', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const offrampPayload = {
        amount: 1000,
        beneficiaryWallet: 'wallet-123',
        paymentDetails: {
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        },
      };

      const mockApiResponse = {
        data: {
          data: {
            id: 'offramp-request-123',
            status: 'SUCCESS',
            transactionHash: 'tx-hash-123',
          },
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.post.mockResolvedValue(mockApiResponse);

      const result = await service.instantOfframp(offrampPayload);

      expect(result).toEqual({
        id: 'offramp-request-123',
        status: 'SUCCESS',
        transactionHash: 'tx-hash-123',
      });

      expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
        'https://api.offramp.com/offramp-request/instant',
        offrampPayload,
        {
          headers: {
            APP_ID: 'test-app-id',
          },
        }
      );
    });

    it('should throw error when instant offramp fails', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const offrampPayload = { amount: 1000 };
      const error = {
        response: {
          data: {
            message: 'Invalid payload',
          },
        },
      };

      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.post.mockRejectedValue(error);

      await expect(service.instantOfframp(offrampPayload)).rejects.toThrow(
        'Failed to initiate instant offramp: Invalid payload'
      );
    });

    it('should handle error without response data', async () => {
      const mockSettings = {
        value: {
          url: 'https://api.offramp.com',
          appid: 'test-app-id',
          accesstoken: 'test-access-token',
        },
      };

      const offrampPayload = { amount: 1000 };
      const error = new Error('Network error');

      mockAppService.getSettings.mockResolvedValue(mockSettings);
      mockHttpService.axiosRef.post.mockRejectedValue(error);

      await expect(service.instantOfframp(offrampPayload)).rejects.toThrow(
        'Failed to initiate instant offramp: Network error'
      );
    });
  });

  describe('addBulkToOfframpQueue', () => {
    it('should add bulk jobs to offramp queue successfully', async () => {
      const payload: FSPOfframpDetails[] = [
        {
          offrampWalletAddress: 'wallet-1',
          beneficiaryWalletAddress: 'ben-wallet-1',
          beneficiaryBankDetails: {
            accountName: 'John Doe',
            accountNumber: '1234567890',
            bankName: 'Test Bank',
          },
          payoutUUID: 'payout-1',
          payoutProcessorId: 'processor-1',
          offrampType: 'FSP',
          transactionHash: 'tx-hash-1',
          amount: 1000,
        },
        {
          offrampWalletAddress: 'wallet-2',
          beneficiaryWalletAddress: 'ben-wallet-2',
          beneficiaryBankDetails: {
            accountName: 'Jane Smith',
            accountNumber: '0987654321',
            bankName: 'Another Bank',
          },
          payoutUUID: 'payout-2',
          payoutProcessorId: 'processor-2',
          offrampType: 'FSP',
          transactionHash: 'tx-hash-2',
          amount: 2000,
        },
      ];

      const mockQueueJobs = [] as any[];

      mockOfframpQueue.addBulk.mockResolvedValue(mockQueueJobs);

      const result = await service.addBulkToOfframpQueue(payload);

      expect(result).toEqual(mockQueueJobs);
      expect(mockOfframpQueue.addBulk).toHaveBeenCalledWith([
        {
          name: 'aa.jobs.offramp.instantOfframp',
          data: payload[0],
          opts: {
            delay: 1000,
            attempts: 1,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        },
        {
          name: 'aa.jobs.offramp.instantOfframp',
          data: payload[1],
          opts: {
            delay: 1000,
            attempts: 1,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        },
      ]);
    });

    it('should handle empty payload array', async () => {
      const payload: FSPOfframpDetails[] = [];
      const mockQueueJobs = [];

      mockOfframpQueue.addBulk.mockResolvedValue(mockQueueJobs);

      const result = await service.addBulkToOfframpQueue(payload);

      expect(result).toEqual(mockQueueJobs);
      expect(mockOfframpQueue.addBulk).toHaveBeenCalledWith([]);
    });
  });

  describe('addToOfframpQueue', () => {
    it('should add single job to offramp queue successfully', async () => {
      const payload: FSPOfframpDetails = {
        offrampWalletAddress: 'wallet-1',
        beneficiaryWalletAddress: 'ben-wallet-1',
        beneficiaryBankDetails: {
          accountName: 'John Doe',
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        },
        payoutUUID: 'payout-1',
        payoutProcessorId: 'processor-1',
        offrampType: 'FSP',
        transactionHash: 'tx-hash-1',
        amount: 1000,
      };

      const mockQueueJobs = [] as any[];

      jest
        .spyOn(service as any, 'addBulkToOfframpQueue')
        .mockResolvedValue(mockQueueJobs);

      const result = await service.addToOfframpQueue(payload);

      expect(result).toEqual(mockQueueJobs);
      expect(service.addBulkToOfframpQueue).toHaveBeenCalledWith([payload]);
    });

    it('should handle queue errors in single add', async () => {
      const payload: FSPOfframpDetails = {
        offrampWalletAddress: 'wallet-1',
        beneficiaryWalletAddress: 'ben-wallet-1',
        beneficiaryBankDetails: {
          accountName: 'John Doe',
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        },
        payoutUUID: 'payout-1',
        payoutProcessorId: 'processor-1',
        offrampType: 'FSP',
        transactionHash: 'tx-hash-1',
        amount: 1000,
      };

      const error = new Error('Queue error');
      jest.spyOn(service, 'addBulkToOfframpQueue').mockRejectedValue(error);

      await expect(service.addToOfframpQueue(payload)).rejects.toThrow(
        'Queue error'
      );
    });
  });
});
