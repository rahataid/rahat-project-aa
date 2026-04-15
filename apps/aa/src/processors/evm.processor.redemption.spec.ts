import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { getQueueToken } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import { EVMProcessor } from './evm.processor';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { InkindsService } from '../inkinds/inkinds.service';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import * as ethers from 'ethers';

describe('EVMProcessor - Inkind Redemption', () => {
  let processor: EVMProcessor;
  let mockPrismaService: any;
  let mockInkindService: any;
  let mockSettingsService: any;
  let mockClientProxy: any;
  let mockEventEmitter: any;

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  };

  const mockProvider = {
    getBlockNumber: jest.fn().mockResolvedValue(12345),
    getBalance: jest.fn().mockResolvedValue(ethers.parseEther('1')),
  };

  const mockSigner = {
    sendTransaction: jest.fn(),
  };

  const mockContractInstance = {
    decimals: {
      staticCall: jest.fn().mockResolvedValue(18),
    },
    redeemInkind: jest.fn(),
  };

  const benificiaryAddress = '0x1234567890123456789012345678901234567890';
  const vendorAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  beforeEach(async () => {
    mockPrismaService = {
      setting: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockInkindService = {
      updateRedeemInkindTxHash: jest.fn().mockResolvedValue({
        success: true,
        message: 'Redemption txHash updated successfully',
      }),
    };

    mockSettingsService = {
      getPublic: jest.fn(),
    };

    mockClientProxy = {
      send: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EVMProcessor,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: InkindsService,
          useValue: mockInkindService,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: CORE_MODULE,
          useValue: mockClientProxy,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: getQueueToken(BQUEUE.EVM),
          useValue: { add: jest.fn() },
        },
      ],
    })
      .setLogger(mockLogger)
      .compile();

    processor = module.get<EVMProcessor>(EVMProcessor);

    // Mock the private methods
    jest
      .spyOn(processor, 'ensureInitialized' as any)
      .mockResolvedValue(undefined);
    jest
      .spyOn(processor, 'createContractInstanceSign' as any)
      .mockResolvedValue(mockContractInstance);
    jest
      .spyOn(processor, 'getFromSettings' as any)
      .mockImplementation((key: string) => {
        if (key === 'CHAIN_SETTINGS') {
          return Promise.resolve({
            rpcUrl: 'http://localhost:8545',
          });
        }
        if (key === 'CONTRACT') {
          return Promise.resolve({
            INKINDTOKEN: {
              ADDRESS: '0xinkindtoken123',
              ABI: [],
            },
            INKIND: {
              ADDRESS: '0xinkind123',
              ABI: [],
            },
          });
        }
        return Promise.resolve({});
      });

    jest.clearAllMocks();
  });

  describe('redeemInKind', () => {
    const jobData = {
      beneficiaryAddress: benificiaryAddress,
      vendorAddress: vendorAddress,
      inkinds: [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      ],
      inkindsValue: 2,
    };

    const createMockJob = (data: any) => ({
      data,
      progress: jest.fn(),
      log: jest.fn(),
    });

    it('should successfully redeem inkinds and update txHash', async () => {
      const mockJob = createMockJob(jobData);
      const mockTxHash = '0x' + 'a'.repeat(64);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      expect(mockContractInstance.redeemInkind).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(String), // bytes16 converted value
          expect.any(String), // bytes16 converted value
        ]),
        vendorAddress,
        benificiaryAddress,
        jobData.inkindsValue
      );

      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalledWith(
        jobData.inkinds,
        mockTxHash,
        benificiaryAddress
      );
    });

    it('should convert UUIDs to bytes16 correctly', async () => {
      const mockJob = createMockJob(jobData);
      const mockTxHash = '0x' + 'b'.repeat(64);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      const callArgs = mockContractInstance.redeemInkind.mock.calls[0];
      const convertedInkinds = callArgs[0];

      // Verify that UUIDs were converted to bytes16 format
      expect(Array.isArray(convertedInkinds)).toBe(true);
      expect(convertedInkinds.length).toBe(jobData.inkinds.length);
      convertedInkinds.forEach((converted: string) => {
        expect(converted).toMatch(/^0x[0-9a-f]{32}$/i); // 32 hex chars = 16 bytes
      });
    });

    it('should handle multiple inkinds correctly', async () => {
      const multipleInkinds = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '7ce9c290-9dad-11d1-80b4-00c04fd430c8',
      ];

      const mockJob = createMockJob({
        ...jobData,
        inkinds: multipleInkinds,
        inkindsValue: multipleInkinds.length,
      });

      const mockTxHash = '0x' + 'c'.repeat(64);
      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      expect(mockContractInstance.redeemInkind).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.any(String),
        ]),
        vendorAddress,
        benificiaryAddress,
        multipleInkinds.length
      );

      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalledWith(
        multipleInkinds,
        mockTxHash,
        benificiaryAddress
      );
    });

    it('should handle contract decimals correctly', async () => {
      const mockJob = createMockJob(jobData);
      mockContractInstance.decimals.staticCall.mockResolvedValue(6);

      const mockTxHash = '0x' + 'd'.repeat(64);
      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      expect(mockContractInstance.redeemInkind).toHaveBeenCalled();
      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalled();
    });

    it('should log transaction hash on success', async () => {
      const mockJob = createMockJob(jobData);
      const mockTxHash = '0x' + 'e'.repeat(64);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing EVM redeem inkind'),
        expect.any(String)
      );
    });

    it('should handle contract call failure', async () => {
      const mockJob = createMockJob(jobData);

      mockContractInstance.redeemInkind.mockRejectedValue(
        new Error('Contract execution failed')
      );

      await expect(processor.redeemInKind(mockJob as any)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in EVM redeem inkind'),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should handle transaction wait failure', async () => {
      const mockJob = createMockJob(jobData);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockRejectedValue(new Error('Transaction failed')),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await expect(processor.redeemInKind(mockJob as any)).rejects.toThrow();
    });

    it('should handle uninitialized provider', async () => {
      const mockJob = createMockJob(jobData);

      jest
        .spyOn(processor, 'ensureInitialized' as any)
        .mockRejectedValue(new RpcException('EVM provider not initialized'));

      await expect(processor.redeemInKind(mockJob as any)).rejects.toThrow(
        RpcException
      );
    });

    it('should handle missing contract configuration', async () => {
      const mockJob = createMockJob(jobData);

      jest
        .spyOn(processor, 'getFromSettings' as any)
        .mockRejectedValue(new Error('CONTRACT configuration not found'));

      await expect(processor.redeemInKind(mockJob as any)).rejects.toThrow();
    });

    it('should pass correct contract call parameters', async () => {
      const mockJob = createMockJob(jobData);
      const mockTxHash = '0x' + 'f'.repeat(64);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      const callArgs = mockContractInstance.redeemInkind.mock.calls[0];

      // Verify order of parameters
      expect(callArgs[0]).toBeTruthy(); // inkinds array
      expect(callArgs[1]).toBe(vendorAddress); // vendor address
      expect(callArgs[2]).toBe(benificiaryAddress); // beneficiary address
      expect(callArgs[3]).toBe(jobData.inkindsValue); // inkinds value
    });

    it('should handle single inkind redemption', async () => {
      const singleInkindJob = createMockJob({
        ...jobData,
        inkinds: ['550e8400-e29b-41d4-a716-446655440000'],
        inkindsValue: 1,
      });

      const mockTxHash = '0x' + '1'.repeat(64);
      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(singleInkindJob as any);

      const callArgs = mockContractInstance.redeemInkind.mock.calls[0];
      const convertedInkinds = callArgs[0];

      expect(convertedInkinds).toHaveLength(1);
      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalledWith(
        ['550e8400-e29b-41d4-a716-446655440000'],
        mockTxHash,
        benificiaryAddress
      );
    });

    it('should call updateRedeemInkindTxHash with correct parameters', async () => {
      const mockJob = createMockJob(jobData);
      const mockTxHash = '0x' + '2'.repeat(64);

      const mockRedeemInkindTx = {
        wait: jest.fn().mockResolvedValue({
          hash: mockTxHash,
          blockNumber: 12345,
          status: 1,
        }),
      };

      mockContractInstance.redeemInkind.mockResolvedValue(mockRedeemInkindTx);

      await processor.redeemInKind(mockJob as any);

      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalledWith(
        jobData.inkinds,
        mockTxHash,
        benificiaryAddress
      );

      expect(mockInkindService.updateRedeemInkindTxHash).toHaveBeenCalledTimes(
        1
      );
    });
  });
});
