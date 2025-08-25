import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { of, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { AppService } from '../app/app.service';
import { getQueueToken } from '@nestjs/bull';
import { GroupPurpose } from '@prisma/client';

// Import Stellar SDK classes for mocking
import {
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Contract,
  Keypair,
  xdr,
  scValToNative,
} from '@stellar/stellar-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

jest.mock('@rahataid/stellar-sdk');
jest.mock('bcryptjs');
jest.mock('@stellar/stellar-sdk', () => ({
  TransactionBuilder: jest.fn(),
  Networks: { TESTNET: 'TESTNET' },
  BASE_FEE: '100',
  Contract: jest.fn(),
  Keypair: {
    fromSecret: jest.fn(),
  },
  xdr: {
    ScVal: {
      scvString: jest.fn(),
    },
  },
  scValToNative: jest.fn(),
  rpc: {
    Server: jest.fn(),
  },
}));

describe('StellarService', () => {
  let service: StellarService;
  let clientProxy: jest.Mocked<ClientProxy>;
  let prismaService: jest.Mocked<PrismaService>;
  let settingsService: jest.Mocked<SettingsService>;
  let receiveService: jest.Mocked<ReceiveService>;
  let transactionService: jest.Mocked<TransactionService>;
  let disbursementServices: jest.Mocked<DisbursementServices>;
  let appService: jest.Mocked<AppService>;
  let stellarQueue: any;
  let checkTrustlineQueue: any;

  const mockClientProxy = {
    send: jest.fn(),
  };

  const mockPrismaService = {
    beneficiaryGroupTokens: {
      findMany: jest.fn(),
    },
    otp: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    beneficiaryGroups: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    vendor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    beneficiaryRedeem: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockSettingsService = {
    getPublic: jest.fn().mockResolvedValue({
      value: {
        EMAIL: 'test@example.com',
        PASSWORD: 'password',
        TENANTNAME: 'test_tenant',
        SERVER: 'https://horizon-testnet.stellar.org',
        KEYPAIR: 'SAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        CONTRACTID: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        VENDORADDRESS: 'test_vendor',
        ASSETCODE: 'RAHAT',
        ONE_TOKEN_PRICE: 1,
        FAUCET_BATCH_SIZE: 5,
      },
    }),
  };

  const mockBullQueueStellar = {
    add: jest.fn().mockResolvedValue({ id: 'job-123', data: {}, opts: {} }),
    addBulk: jest
      .fn()
      .mockResolvedValue([{ id: 'job-123', data: {}, opts: {} }]),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockBullQueueCheckTrustline = {
    add: jest.fn().mockResolvedValue({ id: 'job-456', data: {}, opts: {} }),
    addBulk: jest
      .fn()
      .mockResolvedValue([{ id: 'job-456', data: {}, opts: {} }]),
    process: jest.fn(),
    on: jest.fn(),
  };

  const mockReceiveService = {
    sendAsset: jest.fn(),
    faucetAndTrustlineService: jest.fn(),
    getAccountBalance: jest.fn(),
  };

  const mockTransactionService = {
    hasTrustline: jest.fn(),
    rahatFaucetService: jest.fn(),
    getTransaction: jest.fn(),
  };

  const mockDisbursementServices = {
    createDisbursementProcess: jest.fn(),
    getDistributionAddress: jest.fn().mockResolvedValue('test_address'),
    getDisbursement: jest.fn(),
  };

  const mockAppService = {
    getSettings: jest.fn().mockResolvedValue({
      name: 'PROJECTINFO',
      value: {
        active_year: '2024',
        river_basin: 'test-basin',
      },
    }),
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
        StellarService,
        {
          provide: CORE_MODULE,
          useValue: mockClientProxy,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR),
          useValue: mockBullQueueStellar,
        },
        {
          provide: getQueueToken(BQUEUE.STELLAR_CHECK_TRUSTLINE),
          useValue: mockBullQueueCheckTrustline,
        },
        {
          provide: ReceiveService,
          useValue: mockReceiveService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: DisbursementServices,
          useValue: mockDisbursementServices,
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
    service = module.get<StellarService>(StellarService);
    clientProxy = module.get(CORE_MODULE);
    prismaService = module.get(PrismaService);
    settingsService = module.get(SettingsService);
    receiveService = module.get(ReceiveService);
    transactionService = module.get(TransactionService);
    disbursementServices = module.get(DisbursementServices);
    appService = module.get(AppService);
    stellarQueue = module.get(getQueueToken(BQUEUE.STELLAR));
    checkTrustlineQueue = module.get(
      getQueueToken(BQUEUE.STELLAR_CHECK_TRUSTLINE)
    );
    eventEmitter = module.get(EventEmitter2);
    mockAppService.getSettings.mockResolvedValue({
      value: { project_name: 'Test Project' },
    });
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTriggerWithID', () => {
    const mockTriggerDto = { id: 'trigger-123' };

    beforeEach(() => {
      // Mock Stellar SDK classes
      const mockServer = {
        prepareTransaction: jest.fn(),
        simulateTransaction: jest.fn(),
        getAccount: jest.fn(),
      };

      const mockTransaction = {
        addOperation: jest.fn().mockReturnThis(),
        setTimeout: jest.fn().mockReturnThis(),
        build: jest.fn().mockReturnThis(),
      };

      const mockKeypair = {
        publicKey: jest
          .fn()
          .mockReturnValue(
            'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
          ),
      };

      const mockContract = {
        call: jest.fn(),
      };

      (TransactionBuilder as any).mockImplementation(() => mockTransaction);
      (Contract as any).mockImplementation(() => mockContract);
      (Keypair.fromSecret as any).mockReturnValue(mockKeypair);
      (xdr.ScVal.scvString as any).mockReturnValue('mock-scval');

      mockServer.prepareTransaction.mockResolvedValue(mockTransaction);
      mockServer.simulateTransaction.mockResolvedValue({
        result: { retval: 'mock-result' },
      });
      mockServer.getAccount.mockResolvedValue({ account: 'mock-account' });

      // Mock the rpc Server
      const { rpc } = require('@stellar/stellar-sdk');
      rpc.Server.mockImplementation(() => mockServer);

      // Mock getStellarObjects method
      jest.spyOn(service as any, 'getStellarObjects').mockResolvedValue({
        server: mockServer,
        sourceAccount: { account: 'mock-account' },
        contract: mockContract,
      });
    });

    it('should successfully get trigger with array result', async () => {
      const mockArrayResult = [
        {
          _attributes: {
            key: { _value: 'test-key' },
            val: { _value: 'test-value' },
          },
        },
      ];

      (scValToNative as any).mockReturnValue(mockArrayResult);

      const result = await service.getTriggerWithID(mockTriggerDto);

      expect(result).toEqual({ 'test-key': 'test-value' });
    });

    it('should successfully get trigger with object result', async () => {
      const mockObjectResult = { status: 'active', data: 'test' };

      (scValToNative as any).mockReturnValue(mockObjectResult);

      const result = await service.getTriggerWithID(mockTriggerDto);

      expect(result).toEqual(mockObjectResult);
    });

    it('should successfully get trigger with primitive result', async () => {
      (scValToNative as any).mockReturnValue('primitive-value');

      const result = await service.getTriggerWithID(mockTriggerDto);

      expect(result).toEqual({ value: 'primitive-value' });
    });

    it('should handle complex object keys and values in array result', async () => {
      const mockArrayResult = [
        {
          _attributes: {
            key: { _value: { complex: 'key' } },
            val: { _value: { complex: 'value' } },
          },
        },
      ];

      (scValToNative as any).mockReturnValue(mockArrayResult);

      const result = await service.getTriggerWithID(mockTriggerDto);

      expect(result).toEqual({
        '{"complex":"key"}': '{"complex":"value"}',
      });
    });

    it('should handle malformed items in array result', async () => {
      const mockArrayResult = [
        {
          _attributes: {
            key: { _value: 'valid-key' },
            val: { _value: 'valid-value' },
          },
        },
        {
          // Malformed item that will cause JSON.stringify to fail
          _attributes: {
            key: { _value: { circular: {} as any } },
            val: { _value: 'test' },
          },
        },
      ];

      // Make the circular reference
      (mockArrayResult[1]._attributes.key._value as any).circular.self = (
        mockArrayResult[1]._attributes.key._value as any
      ).circular;

      (scValToNative as any).mockReturnValue(mockArrayResult);

      await expect(service.getTriggerWithID(mockTriggerDto)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Failed to process contract result:'
          ),
        })
      );
    });

    it('should throw RpcException when contract not found', async () => {
      (scValToNative as any).mockReturnValue(null);

      await expect(service.getTriggerWithID(mockTriggerDto)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Failed to process contract result:'
          ),
        })
      );
    });

    it('should throw RpcException on contract processing error', async () => {
      jest
        .spyOn(service as any, 'getStellarObjects')
        .mockRejectedValue(new Error('Contract processing failed'));

      await expect(service.getTriggerWithID(mockTriggerDto)).rejects.toThrow(
        new RpcException(
          'Failed to process contract result: Contract processing failed'
        )
      );
    });
  });

  describe('sendGroupOTP', () => {
    const mockSendGroupDto = {
      vendorUuid: 'vendor-uuid-123',
    };

    const mockVendorWithOfflineBeneficiaries = {
      uuid: 'vendor-uuid-123',
      OfflineBeneficiary: [
        { uuid: 'offline-ben-1' },
        { uuid: 'offline-ben-2' },
      ],
    };

    beforeEach(() => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(
        mockVendorWithOfflineBeneficiaries
      );
    });

    it('should successfully send group OTP', async () => {
      const mockBeneficiaryResponse = [
        { uuid: 'offline-ben-1', phone: '+1234567890' },
        { uuid: 'offline-ben-2', phone: '+0987654321' },
      ];

      mockClientProxy.send.mockReturnValue(of(mockBeneficiaryResponse));

      const result = await service.sendGroupOTP(mockSendGroupDto);

      expect(mockPrismaService.vendor.findUnique).toHaveBeenCalledWith({
        where: { uuid: 'vendor-uuid-123' },
        include: { OfflineBeneficiary: true },
      });

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: ['offline-ben-1', 'offline-ben-2'] }
      );
    });

    it('should throw RpcException when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(service.sendGroupOTP(mockSendGroupDto)).rejects.toThrow(
        new RpcException('Vendor not found')
      );
    });

    it('should throw RpcException when beneficiaries not found', async () => {
      mockClientProxy.send.mockReturnValue(of(null));

      await expect(service.sendGroupOTP(mockSendGroupDto)).rejects.toThrow(
        new RpcException('Beneficiaries not found')
      );
    });
  });

  describe('getActivityActivationTime - Edge Cases', () => {
    beforeEach(() => {
      mockClientProxy.send.mockReturnValue(
        of({
          data: [
            {
              name: 'ACTIVATION',
              isActive: true,
              activatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        })
      );
    });

    it('should return null when activeYear is missing', async () => {
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          river_basin: 'test-basin',
          // activeYear is missing
        },
      });

      const result = await service.getActivityActivationTime();

      expect(result).toBeNull();
    });

    it('should return null when riverBasin is missing', async () => {
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          active_year: '2024',
          // river_basin is missing
        },
      });

      const result = await service.getActivityActivationTime();

      expect(result).toBeNull();
    });

    it('should return null when both activeYear and riverBasin are missing', async () => {
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          // Both missing
        },
      });

      const result = await service.getActivityActivationTime();

      expect(result).toBeNull();
    });
  });

  describe('private method testing via public methods', () => {
    describe('getBatchSizeFromSettings (via internalFaucetAndTrustline)', () => {
      const mockBeneficiaries = {
        wallets: [{ address: 'wallet1' }, { address: 'wallet2' }],
        beneficiaryGroupId: 'group-123',
      };

      it('should use batch size from settings when available', async () => {
        const result = await service.internalFaucetAndTrustline(
          mockBeneficiaries
        );

        expect(result.message).toContain('Created');
        expect(stellarQueue.addBulk).toHaveBeenCalled();
      });

      it('should use default batch size when settings fail', async () => {
        mockSettingsService.getPublic.mockRejectedValue(
          new Error('Settings error')
        );

        const result = await service.internalFaucetAndTrustline(
          mockBeneficiaries
        );

        expect(result.message).toContain('Created');
        expect(stellarQueue.addBulk).toHaveBeenCalled();
      });

      it('should use default batch size when FAUCET_BATCH_SIZE is invalid', async () => {
        mockSettingsService.getPublic.mockResolvedValue({
          value: {
            FAUCET_BATCH_SIZE: 'invalid-number',
          },
        });

        const result = await service.internalFaucetAndTrustline(
          mockBeneficiaries
        );

        expect(result.message).toContain('Created');
        expect(stellarQueue.addBulk).toHaveBeenCalled();
      });
    });

    describe('getSecretByPhone and getSecretByWallet (via public methods)', () => {
      it('should test getSecretByPhone error handling via getBenTotal', async () => {
        mockClientProxy.send.mockReturnValue(
          throwError(() => new Error('Phone not found'))
        );

        await expect(
          (service as any).getBenTotal('+1234567890')
        ).rejects.toThrow(RpcException);

        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
          { phoneNumber: '+1234567890', chain: 'stellar' }
        );
      });

      it('should test getSecretByWallet error handling', async () => {
        mockClientProxy.send.mockReturnValue(
          throwError(() => new Error('Wallet not found'))
        );

        await expect(
          service.getSecretByWallet('wallet-address')
        ).rejects.toThrow(
          new RpcException('Beneficiary with wallet wallet-address not found')
        );

        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.wallet.getSecretByWallet' },
          { walletAddress: 'wallet-address', chain: 'stellar' }
        );
      });
    });

    describe('storeOTP and verifyOTP (via sendOtp and sendAssetToVendor)', () => {
      beforeEach(() => {
        const mockPayoutType = {
          uuid: 'payout-uuid-123',
          type: 'VENDOR',
          mode: 'ONLINE',
        };

        const mockVendor = {
          uuid: 'vendor-uuid-123',
          walletAddress: 'vendor-wallet-address',
        };

        const mockBeneficiaryKeys = {
          address: 'beneficiary-address',
          publicKey: 'beneficiary-public-key',
          privateKey: 'beneficiary-private-key',
        };

        jest
          .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
          .mockResolvedValue(mockPayoutType);
        jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);
        jest
          .spyOn(service as any, 'getSecretByPhone')
          .mockResolvedValue(mockBeneficiaryKeys);
        mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));
        mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
        mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);
        mockPrismaService.beneficiaryRedeem.create.mockResolvedValue({
          uuid: 'redeem-uuid',
        });
      });

      it('should test storeOTP with successful OTP creation', async () => {
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashedOtp');
        mockPrismaService.otp.upsert.mockResolvedValue({
          id: 1,
          phoneNumber: '+1234567890',
          amount: 100,
          otpHash: 'hashedOtp',
        });

        const mockSendOtpDto = {
          phoneNumber: '+1234567890',
          amount: '100',
          vendorUuid: 'vendor-uuid-123',
        };

        const result = await service.sendOtp(mockSendOtpDto);

        expect(bcrypt.hash).toHaveBeenCalledWith('123456:100', 10);
        expect(mockPrismaService.otp.upsert).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it('should test verifyOTP with various scenarios', async () => {
        const mockSendAssetDto = {
          phoneNumber: '+1234567890',
          otp: '123456',
          receiverAddress: 'vendor-wallet-address',
          amount: 100,
        };

        // Test successful verification
        mockPrismaService.otp.findUnique.mockResolvedValue({
          id: 1,
          phoneNumber: '+1234567890',
          otpHash: 'hashedOtp',
          amount: 100,
          isVerified: false,
          expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
        mockReceiveService.sendAsset.mockResolvedValue({
          tx: { hash: 'tx-hash' },
        });

        mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue({
          uuid: 'redeem-uuid',
          beneficiaryWalletAddress: 'beneficiary-public-key',
          vendorUid: 'vendor-uuid',
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          updateAt: new Date().toISOString(),
          Vendor: { name: 'Test Vendor' },
        });
        mockPrismaService.beneficiaryRedeem.update.mockResolvedValue({
          uuid: 'redeem-uuid',
          status: 'COMPLETED',
          isCompleted: true,
          txHash: 'tx-hash',
          updateAt: new Date().toISOString(),
          Vendor: { name: 'Test Vendor' },
        });

        const result = await service.sendAssetToVendor(mockSendAssetDto);

        expect(result).toEqual({ txHash: 'tx-hash' });
      });

      it('should test verifyOTP when OTP record not found', async () => {
        mockPrismaService.otp.findUnique.mockResolvedValue(null);

        const mockSendAssetDto = {
          phoneNumber: '+1234567890',
          otp: '123456',
          receiverAddress: 'vendor-wallet-address',
          amount: 100,
        };

        await expect(
          service.sendAssetToVendor(mockSendAssetDto)
        ).rejects.toThrow(new RpcException('OTP record not found'));
      });

      it('should test verifyOTP when OTP already verified', async () => {
        mockPrismaService.otp.findUnique.mockResolvedValue({
          id: 1,
          phoneNumber: '+1234567890',
          otpHash: 'hashedOtp',
          amount: 100,
          isVerified: true, // Already verified
          expiresAt: new Date(Date.now() + 300000),
        });

        const mockSendAssetDto = {
          phoneNumber: '+1234567890',
          otp: '123456',
          receiverAddress: 'vendor-wallet-address',
          amount: 100,
        };

        await expect(
          service.sendAssetToVendor(mockSendAssetDto)
        ).rejects.toThrow(new RpcException('OTP already verified'));
      });

      it('should test verifyOTP when OTP expired', async () => {
        mockPrismaService.otp.findUnique.mockResolvedValue({
          id: 1,
          phoneNumber: '+1234567890',
          otpHash: 'hashedOtp',
          amount: 100,
          isVerified: false,
          expiresAt: new Date(Date.now() - 300000), // 5 minutes ago (expired)
        });

        const mockSendAssetDto = {
          phoneNumber: '+1234567890',
          otp: '123456',
          receiverAddress: 'vendor-wallet-address',
          amount: 100,
        };

        await expect(
          service.sendAssetToVendor(mockSendAssetDto)
        ).rejects.toThrow(new RpcException('OTP has expired'));
      });

      it('should test verifyOTP when OTP is invalid', async () => {
        mockPrismaService.otp.findUnique.mockResolvedValue({
          id: 1,
          phoneNumber: '+1234567890',
          otpHash: 'hashedOtp',
          amount: 100,
          isVerified: false,
          expiresAt: new Date(Date.now() + 300000),
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false); // Invalid OTP

        const mockSendAssetDto = {
          phoneNumber: '+1234567890',
          otp: '123456',
          receiverAddress: 'vendor-wallet-address',
          amount: 100,
        };

        await expect(
          service.sendAssetToVendor(mockSendAssetDto)
        ).rejects.toThrow(new RpcException('Invalid OTP or amount mismatch'));
      });
    });

    describe('getRahatBalance', () => {
      beforeEach(() => {
        jest
          .spyOn(service as any, 'getFromSettings')
          .mockImplementation((key) => {
            if (key === 'ASSETCODE') return Promise.resolve('RAHAT');
            return Promise.resolve(null);
          });
      });

      it('should get RAHAT balance successfully', async () => {
        const mockBalances = [
          { asset_code: 'XLM', balance: '1000' },
          { asset_code: 'RAHAT', balance: '500.5' },
          { asset_code: 'OTHER', balance: '200' },
        ];

        mockReceiveService.getAccountBalance.mockResolvedValue(mockBalances);

        const result = await service.getRahatBalance('test-wallet-address');

        expect(result).toBe(500); // Math.floor of 500.5
        expect(mockReceiveService.getAccountBalance).toHaveBeenCalledWith(
          'test-wallet-address'
        );
      });

      it('should return 0 when RAHAT asset not found', async () => {
        const mockBalances = [
          { asset_code: 'XLM', balance: '1000' },
          { asset_code: 'OTHER', balance: '200' },
        ];

        mockReceiveService.getAccountBalance.mockResolvedValue(mockBalances);

        const result = await service.getRahatBalance('test-wallet-address');

        expect(result).toBe(0);
      });

      it('should return 0 on error', async () => {
        mockReceiveService.getAccountBalance.mockRejectedValue(
          new Error('Network error')
        );

        const result = await service.getRahatBalance('test-wallet-address');

        expect(result).toBe(0);
      });
    });

    describe('getBeneficiaryPayoutTypeByPhone', () => {
      it('should get payout type successfully', async () => {
        const mockBeneficiary = {
          uuid: 'ben-uuid',
          groupedBeneficiaries: [
            {
              beneficiaryGroupId: 'group-1',
              groupPurpose: 'BANK_TRANSFER',
            },
            {
              beneficiaryGroupId: 'group-2',
              groupPurpose: 'COMMUNICATION', // Should be filtered out
            },
          ],
        };

        const mockBeneficiaryGroup = {
          uuid: 'group-1',
          tokensReserved: {
            payout: {
              uuid: 'payout-uuid',
              type: 'VENDOR',
              mode: 'ONLINE',
            },
          },
        };

        mockClientProxy.send.mockReturnValue(of(mockBeneficiary));
        mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
          mockBeneficiaryGroup
        );

        const result = await (service as any).getBeneficiaryPayoutTypeByPhone(
          '+1234567890'
        );

        expect(result).toEqual({
          uuid: 'payout-uuid',
          type: 'VENDOR',
          mode: 'ONLINE',
        });

        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
          '+1234567890'
        );
      });

      it('should throw RpcException when beneficiary not found', async () => {
        mockClientProxy.send.mockReturnValue(of(null));

        await expect(
          (service as any).getBeneficiaryPayoutTypeByPhone('+1234567890')
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Failed to retrieve payout type:'),
          })
        );
      });

      it('should throw RpcException when no payout-eligible groups found', async () => {
        const mockBeneficiary = {
          uuid: 'ben-uuid',
          groupedBeneficiaries: [
            {
              beneficiaryGroupId: 'group-1',
              groupPurpose: 'COMMUNICATION', // Only communication group
            },
          ],
        };

        mockClientProxy.send.mockReturnValue(of(mockBeneficiary));

        await expect(
          (service as any).getBeneficiaryPayoutTypeByPhone('+1234567890')
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Failed to retrieve payout type:'),
          })
        );
      });

      it('should throw RpcException when beneficiary group not found', async () => {
        const mockBeneficiary = {
          uuid: 'ben-uuid',
          groupedBeneficiaries: [
            {
              beneficiaryGroupId: 'group-1',
              groupPurpose: 'BANK_TRANSFER',
            },
          ],
        };

        mockClientProxy.send.mockReturnValue(of(mockBeneficiary));
        mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(null);

        await expect(
          (service as any).getBeneficiaryPayoutTypeByPhone('+1234567890')
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Failed to retrieve payout type:'),
          })
        );
      });

      it('should throw RpcException when tokens not reserved', async () => {
        const mockBeneficiary = {
          uuid: 'ben-uuid',
          groupedBeneficiaries: [
            {
              beneficiaryGroupId: 'group-1',
              groupPurpose: 'BANK_TRANSFER',
            },
          ],
        };

        const mockBeneficiaryGroup = {
          uuid: 'group-1',
          tokensReserved: null, // No tokens reserved
        };

        mockClientProxy.send.mockReturnValue(of(mockBeneficiary));
        mockPrismaService.beneficiaryGroups.findUnique.mockResolvedValue(
          mockBeneficiaryGroup
        );

        await expect(
          (service as any).getBeneficiaryPayoutTypeByPhone('+1234567890')
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Failed to retrieve payout type:'),
          })
        );
      });
    });
  });

  describe('Edge cases and error scenarios', () => {
    describe('disburse method edge cases', () => {
      it('should handle empty beneficiary list', async () => {
        jest
          .spyOn(service as any, 'getBeneficiaryTokenBalance')
          .mockResolvedValue([]);
        mockDisbursementServices.createDisbursementProcess.mockResolvedValue({
          success: true,
        });

        const mockDiburseDto = {
          dName: 'test_disbursement',
          groups: ['group1'],
        };

        const result = await service.disburse(mockDiburseDto);
        expect(result).toEqual({ success: true });
      });

      it('should calculate total tokens correctly', async () => {
        const mockBeneficiaries = [
          { walletAddress: 'addr1', amount: '100', phone: '123', id: 'ben1' },
          { walletAddress: 'addr2', amount: '200', phone: '456', id: 'ben2' },
        ];

        jest
          .spyOn(service as any, 'getBeneficiaryTokenBalance')
          .mockResolvedValue(mockBeneficiaries);
        mockDisbursementServices.createDisbursementProcess.mockResolvedValue({
          success: true,
        });

        const mockDiburseDto = {
          dName: 'test_disbursement',
          groups: ['group1'],
        };

        const result = await service.disburse(mockDiburseDto);

        expect(
          mockDisbursementServices.createDisbursementProcess
        ).toHaveBeenCalledWith(
          'test_disbursement',
          expect.any(Buffer), // CSV buffer
          'test_disbursement_file',
          '300' // Total tokens (100 + 200)
        );
      });
    });

    describe('getWalletStats edge cases', () => {
      it('should handle non-phone address that starts with 9', async () => {
        const mockWalletBalanceDto = {
          address: '9XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        };
        const mockBeneficiary = { walletAddress: 'converted-wallet-address' };

        mockClientProxy.send.mockReturnValue(of(mockBeneficiary));
        mockReceiveService.getAccountBalance.mockResolvedValue([]);
        jest
          .spyOn(service as any, 'getRecentTransaction')
          .mockResolvedValue([]);

        const result = await service.getWalletStats(mockWalletBalanceDto);

        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
          '9XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
        );
        expect(result).toHaveProperty('balances');
        expect(result).toHaveProperty('transactions');
      });

      it('should handle getWalletStats error', async () => {
        const mockWalletBalanceDto = { address: 'test-wallet' };

        mockReceiveService.getAccountBalance.mockRejectedValue(
          new Error('Network error')
        );

        await expect(
          service.getWalletStats(mockWalletBalanceDto)
        ).rejects.toThrow(new RpcException('Network error'));
      });
    });

    describe('sendOtp edge cases', () => {
      it('should use beneficiary balance when amount not provided', async () => {
        const mockPayoutType = {
          uuid: 'payout-uuid-123',
          type: 'VENDOR',
          mode: 'ONLINE',
        };

        jest
          .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
          .mockResolvedValue(mockPayoutType);
        jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(500);
        jest.spyOn(service as any, 'getSecretByPhone').mockResolvedValue({
          publicKey: 'public-key',
        });
        jest.spyOn(service as any, 'storeOTP').mockResolvedValue({ id: 1 });

        const mockVendor = {
          uuid: 'vendor-uuid',
          walletAddress: 'vendor-wallet',
        };
        mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
        mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);
        mockPrismaService.beneficiaryRedeem.create.mockResolvedValue({
          uuid: 'redeem-uuid',
        });
        mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));

        const mockSendOtpDto = {
          phoneNumber: '+1234567890',
          // amount not provided
          vendorUuid: 'vendor-uuid-123',
        };

        const result = await service.sendOtp(mockSendOtpDto);

        expect(service['getBenTotal']).toHaveBeenCalledWith('+1234567890');
        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.otp.send_otp' },
          { phoneNumber: '+1234567890', amount: 500 }
        );
      });

      it('should throw error when amount exceeds beneficiary balance', async () => {
        const mockPayoutType = {
          uuid: 'payout-uuid-123',
          type: 'VENDOR',
          mode: 'ONLINE',
        };

        jest
          .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
          .mockResolvedValue(mockPayoutType);
        jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(100); // Low balance

        const mockSendOtpDto = {
          phoneNumber: '+1234567890',
          amount: '500', // Higher than balance
          vendorUuid: 'vendor-uuid-123',
        };

        await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
          new RpcException('Amount is greater than rahat balance')
        );
      });

      it('should throw error when amount is zero or negative', async () => {
        const mockPayoutType = {
          uuid: 'payout-uuid-123',
          type: 'VENDOR',
          mode: 'ONLINE',
        };

        jest
          .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
          .mockResolvedValue(mockPayoutType);
        jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);

        const mockSendOtpDto = {
          phoneNumber: '+1234567890',
          amount: '0', // Zero amount
          vendorUuid: 'vendor-uuid-123',
        };

        await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
          new RpcException('Amount must be greater than 0')
        );
      });

      it('should update existing beneficiaryRedeem record', async () => {
        const mockPayoutType = {
          uuid: 'payout-uuid-123',
          type: 'VENDOR',
          mode: 'ONLINE',
        };

        jest
          .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
          .mockResolvedValue(mockPayoutType);
        jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);
        jest.spyOn(service as any, 'getSecretByPhone').mockResolvedValue({
          publicKey: 'public-key',
        });
        jest.spyOn(service as any, 'storeOTP').mockResolvedValue({ id: 1 });

        const mockVendor = {
          uuid: 'vendor-uuid',
          walletAddress: 'vendor-wallet',
        };
        const existingRedeem = { uuid: 'existing-redeem-uuid' };

        mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
        mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(
          existingRedeem
        );
        mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));

        const mockSendOtpDto = {
          phoneNumber: '+1234567890',
          amount: '100',
          vendorUuid: 'vendor-uuid-123',
        };

        await service.sendOtp(mockSendOtpDto);

        expect(mockPrismaService.beneficiaryRedeem.update).toHaveBeenCalledWith(
          {
            where: { uuid: 'existing-redeem-uuid' },
            data: expect.objectContaining({
              vendorUid: 'vendor-uuid-123',
              amount: '100',
              status: 'PENDING',
              isCompleted: false,
              txHash: null,
              payoutId: 'payout-uuid-123',
              info: expect.any(Object),
            }),
          }
        );
      });
    });
  });

  describe('addDisbursementJobs', () => {
    const mockDiburseDto = {
      dName: 'test_disbursement',
      groups: ['group1', 'group2'],
    };

    const mockGroups = [
      {
        uuid: 'group1',
        name: 'Group 1',
        groupPurpose: GroupPurpose.BANK_TRANSFER,
        tokensReserved: {
          title: 'Test Token',
          uuid: 'token1',
        },
      },
      {
        uuid: 'group2',
        name: 'Group 2',
        groupPurpose: GroupPurpose.BANK_TRANSFER,
        tokensReserved: {
          title: 'Test Token 2',
          uuid: 'token2',
        },
      },
    ];

    beforeEach(() => {
      jest
        .spyOn(service as any, 'getGroupsFromUuid')
        .mockResolvedValue(mockGroups);
    });

    it('should successfully add disbursement jobs for provided groups', async () => {
      const result = await service.addDisbursementJobs(mockDiburseDto);

      expect(result.message).toBe('Disbursement jobs added for 2 groups');
      expect(result.groups).toHaveLength(2);
      expect(stellarQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE,
            data: expect.objectContaining({
              dName: expect.stringContaining('test_disbursement'),
              groups: ['group1'],
            }),
          }),
        ])
      );
    });

    it('should get disbursable groups when no groups provided', async () => {
      jest
        .spyOn(service as any, 'getDisbursableGroupsUuids')
        .mockResolvedValue(['group1']);

      const result = await service.addDisbursementJobs({ dName: 'test' });

      expect(service['getDisbursableGroupsUuids']).toHaveBeenCalled();
      expect(result.groups).toHaveLength(2); // Based on mock groups
    });

    it('should return empty result when no groups found', async () => {
      jest
        .spyOn(service as any, 'getDisbursableGroupsUuids')
        .mockResolvedValue([]);
      jest.spyOn(service as any, 'getGroupsFromUuid').mockResolvedValue([]);

      const result = await service.addDisbursementJobs({ dName: 'test' });

      expect(result.message).toBe('No groups found for disbursement');
      expect(result.groups).toEqual([]);
    });
  });

  describe('getDisbursement', () => {
    it('should get disbursement by ID', async () => {
      const mockDisbursement = { id: '123', status: 'completed' };
      mockDisbursementServices.getDisbursement.mockResolvedValue(
        mockDisbursement
      );

      const result = await service.getDisbursement('123');

      expect(result).toEqual(mockDisbursement);
      expect(mockDisbursementServices.getDisbursement).toHaveBeenCalledWith(
        '123'
      );
    });
  });

  describe('sendAssetToVendor', () => {
    const mockSendAssetDto = {
      phoneNumber: '+1234567890',
      otp: '123456',
      receiverAddress: 'vendor-wallet-address',
      amount: 100,
    };

    const mockVendor = {
      uuid: 'vendor-uuid',
      walletAddress: 'vendor-wallet-address',
    };

    const mockBeneficiaryKeys = {
      address: 'beneficiary-address',
      publicKey: 'beneficiary-public-key',
      privateKey: 'beneficiary-private-key',
    };

    const mockTransaction = {
      tx: { hash: 'transaction-hash' },
    };

    beforeEach(() => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);
      jest.spyOn(service as any, 'verifyOTP').mockResolvedValue(true);
      jest
        .spyOn(service as any, 'getSecretByPhone')
        .mockResolvedValue(mockBeneficiaryKeys);
      mockReceiveService.sendAsset.mockResolvedValue(mockTransaction);
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue({
        uuid: 'redeem-uuid',
        beneficiaryWalletAddress: 'beneficiary-public-key',
        vendorUid: 'vendor-uuid',
        status: 'PENDING',
        isCompleted: false,
        txHash: null,
        updateAt: new Date().toISOString(),
        Vendor: { name: 'Test Vendor' },
      });

      mockPrismaService.beneficiaryRedeem.create.mockResolvedValue({
        uuid: 'new-redeem-uuid',
        beneficiaryWalletAddress: 'beneficiary-public-key',
        vendorUid: 'vendor-uuid',
        status: 'COMPLETED',
        isCompleted: true,
        txHash: 'transaction-hash',
        updateAt: new Date().toISOString(),
        Vendor: { name: 'Test Vendor' },
      });

      mockPrismaService.beneficiaryRedeem.update.mockResolvedValue({
        uuid: 'redeem-uuid',
        beneficiaryWalletAddress: 'beneficiary-public-key',
        vendorUid: 'vendor-uuid',
        status: 'COMPLETED',
        isCompleted: true,
        txHash: 'transaction-hash',
        updateAt: new Date().toISOString(),
        Vendor: { name: 'Test Vendor' },
      });
    });

    it('should successfully send asset to vendor', async () => {
      const result = await service.sendAssetToVendor(mockSendAssetDto);

      expect(result).toEqual({ txHash: 'transaction-hash' });
      expect(mockReceiveService.sendAsset).toHaveBeenCalledWith(
        'beneficiary-private-key',
        'vendor-wallet-address',
        '100'
      );
      expect(mockPrismaService.beneficiaryRedeem.update).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        EVENTS.NOTIFICATION.CREATE,
        expect.objectContaining({
          payload: expect.objectContaining({
            title: 'Vendor Redemption Completed',
            group: 'Vendor Management',
            projectId: 'mock-project-id',
          }),
        })
      );
    });

    it('should throw RpcException when vendor not found', async () => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(null);

      await expect(service.sendAssetToVendor(mockSendAssetDto)).rejects.toThrow(
        new RpcException('Vendor not found')
      );
    });

    it('should create new record when no existing redeem found', async () => {
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);

      const result = await service.sendAssetToVendor(mockSendAssetDto);

      expect(result).toEqual({ txHash: 'transaction-hash' });
      expect(mockPrismaService.beneficiaryRedeem.create).toHaveBeenCalled();
    });

    it('should handle transfer failure and update record with error', async () => {
      const error = new Error('Transfer failed');
      mockReceiveService.sendAsset.mockRejectedValue(error);

      await expect(service.sendAssetToVendor(mockSendAssetDto)).rejects.toThrow(
        RpcException
      );
      expect(mockPrismaService.beneficiaryRedeem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            isCompleted: false,
          }),
        })
      );
    });
  });

  describe('sendAssetToVendorByWalletAddress', () => {
    const mockSendAssetByWalletDto = {
      walletAddress: 'beneficiary-wallet',
      receiverAddress: 'vendor-wallet-address',
      amount: 100,
    };

    const mockVendor = {
      uuid: 'vendor-uuid',
      walletAddress: 'vendor-wallet-address',
    };

    const mockBeneficiaryKeys = {
      address: 'beneficiary-address',
      publicKey: 'beneficiary-public-key',
      privateKey: 'beneficiary-private-key',
    };

    beforeEach(() => {
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      jest.spyOn(service as any, 'getRahatBalance').mockResolvedValue(1000);
      jest
        .spyOn(service as any, 'getSecretByWallet')
        .mockResolvedValue(mockBeneficiaryKeys);
      mockReceiveService.sendAsset.mockResolvedValue({
        tx: { hash: 'transaction-hash' },
      });
    });

    it('should successfully send asset by wallet address', async () => {
      const result = await service.sendAssetToVendorByWalletAddress(
        mockSendAssetByWalletDto
      );

      expect(result).toEqual({ txHash: 'transaction-hash' });
      expect(mockPrismaService.beneficiaryRedeem.create).toHaveBeenCalled();
    });

    it('should throw RpcException when amount exceeds balance', async () => {
      jest.spyOn(service as any, 'getRahatBalance').mockResolvedValue(50);

      await expect(
        service.sendAssetToVendorByWalletAddress(mockSendAssetByWalletDto)
      ).rejects.toThrow(
        new RpcException('Amount is greater than rahat balance')
      );
    });

    it('should throw RpcException when amount is zero or negative', async () => {
      const invalidDto = { ...mockSendAssetByWalletDto, amount: -10 };

      await expect(
        service.sendAssetToVendorByWalletAddress(invalidDto)
      ).rejects.toThrow(new RpcException('Amount must be greater than 0'));
    });
  });

  describe('checkTrustline', () => {
    it('should check trustline for wallet address', async () => {
      const mockCheckDto = { walletAddress: 'test-wallet' };
      mockTransactionService.hasTrustline.mockResolvedValue(true);

      const result = await service.checkTrustline(mockCheckDto);

      expect(result).toBe(true);
      expect(mockTransactionService.hasTrustline).toHaveBeenCalledWith(
        'test-wallet'
      );
    });
  });

  describe('faucetAndTrustlineService', () => {
    const mockFundAccountDto = {
      walletAddress: 'test-wallet',
      secretKey: 'secret-key',
    };

    it('should successfully fund account and add trustline', async () => {
      const mockResult = { success: true };
      mockReceiveService.faucetAndTrustlineService.mockResolvedValue(
        mockResult
      );

      const result = await service.faucetAndTrustlineService(
        mockFundAccountDto
      );

      expect(result).toEqual(mockResult);
      expect(mockReceiveService.faucetAndTrustlineService).toHaveBeenCalledWith(
        'test-wallet',
        'secret-key'
      );
    });

    it('should throw error on failure', async () => {
      const error = new Error('Faucet failed');
      mockReceiveService.faucetAndTrustlineService.mockRejectedValue(error);

      await expect(
        service.faucetAndTrustlineService(mockFundAccountDto)
      ).rejects.toThrow('Faucet failed');
    });
  });

  describe('getBeneficiaryTokenBalance', () => {
    const mockGroupUuids = ['group1', 'group2'];
    const mockGroups = [
      {
        uuid: 'group1',
        _count: { groupedBeneficiaries: 2 },
        groupedBeneficiaries: [
          {
            Beneficiary: {
              uuid: 'ben1',
              walletAddress: 'wallet1',
              pii: { phone: '123456789' },
            },
          },
          {
            Beneficiary: {
              uuid: 'ben2',
              walletAddress: 'wallet2',
              pii: { phone: '987654321' },
            },
          },
        ],
      },
    ];
    const mockTokens = [{ numberOfTokens: 200, groupId: 'group1' }];

    beforeEach(() => {
      jest
        .spyOn(service as any, 'fetchGroupedBeneficiaries')
        .mockResolvedValue(mockGroups);
      jest
        .spyOn(service as any, 'fetchGroupTokenAmounts')
        .mockResolvedValue(mockTokens);
    });

    it('should return beneficiary token distribution', async () => {
      const result = await service.getBeneficiaryTokenBalance(mockGroupUuids);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('phone', '123456789');
      expect(result[0]).toHaveProperty('amount', '100'); // 200 tokens / 2 beneficiaries
    });

    it('should return empty array when no groups provided', async () => {
      const result = await service.getBeneficiaryTokenBalance([]);
      expect(result).toEqual([]);
    });
  });

  describe('getWalletStats', () => {
    const mockWalletBalanceDto = { address: 'test-wallet-address' };
    const mockAccountBalances = [{ asset_code: 'RAHAT', balance: '100' }];
    const mockTransactions = [
      {
        asset: 'RAHAT',
        source: 'source-wallet',
        created_at: '2024-01-01',
        amount: '50',
        amtColor: 'green',
        hash: 'tx-hash',
      },
    ];

    beforeEach(() => {
      mockReceiveService.getAccountBalance.mockResolvedValue(
        mockAccountBalances
      );
      jest.spyOn(service as any, 'getRecentTransaction').mockResolvedValue([
        {
          title: 'RAHAT',
          subtitle: 'source-wallet',
          date: '2024-01-01',
          amount: '50',
          amtColor: 'green',
          hash: 'tx-hash',
        },
      ]);
    });

    it('should get wallet stats for wallet address', async () => {
      const result = await service.getWalletStats(mockWalletBalanceDto);

      expect(result).toHaveProperty('balances', mockAccountBalances);
      expect(result).toHaveProperty('transactions');
      expect(mockReceiveService.getAccountBalance).toHaveBeenCalledWith(
        'test-wallet-address'
      );
    });

    it('should handle phone number input', async () => {
      const phoneDto = { address: '+1234567890' };
      const mockBeneficiary = { walletAddress: 'wallet-from-phone' };
      mockClientProxy.send.mockReturnValue(of(mockBeneficiary));

      const result = await service.getWalletStats(phoneDto);

      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
        '+1234567890'
      );
      expect(mockReceiveService.getAccountBalance).toHaveBeenCalledWith(
        'wallet-from-phone'
      );
    });

    it('should throw RpcException when beneficiary not found by phone', async () => {
      const phoneDto = { address: '+1234567890' };
      mockClientProxy.send.mockReturnValue(of(null));

      await expect(service.getWalletStats(phoneDto)).rejects.toThrow(
        new RpcException('Beneficiary not found with wallet +1234567890')
      );
    });
  });

  describe('addTriggerOnChain', () => {
    const mockTriggers = [
      {
        id: 'trigger1',
        trigger_type: 'type1',
        phase: 'phase1',
        title: 'Test Trigger',
        source: 'test-source',
        river_basin: 'test-basin',
        params: { data: 'test' } as any,
        is_mandatory: true,
      },
    ];

    it('should add trigger to blockchain queue', async () => {
      const result = await service.addTriggerOnChain(mockTriggers);

      expect(stellarQueue.add).toHaveBeenCalledWith(
        JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE,
        { triggers: mockTriggers },
        expect.objectContaining({
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 1000 },
        })
      );
      expect(result).toEqual({ id: 'job-123', data: {}, opts: {} });
    });
  });

  describe('updateOnchainTrigger', () => {
    const mockTrigger = {
      id: 'trigger1',
      params: { updated: 'data' },
    };

    it('should update trigger on blockchain queue', async () => {
      const result = await service.updateOnchainTrigger(mockTrigger);

      expect(stellarQueue.add).toHaveBeenCalledWith(
        JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE,
        mockTrigger,
        expect.objectContaining({
          attempts: 3,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 1000 },
        })
      );
      expect(result).toEqual({ id: 'job-123', data: {}, opts: {} });
    });
  });

  describe('getActivityActivationTime', () => {
    const mockPhaseData = {
      data: [
        {
          name: 'ACTIVATION',
          isActive: true,
          activatedAt: '2024-01-01T00:00:00Z',
        },
      ],
    };

    it('should return activation time when phase is active', async () => {
      // Reset the mock to ensure proper setup
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          active_year: '2024',
          river_basin: 'test-basin',
        },
      });
      mockClientProxy.send.mockReturnValue(of(mockPhaseData));

      const result = await service.getActivityActivationTime();

      expect(result).toBe('2024-01-01T00:00:00Z');
      expect(mockAppService.getSettings).toHaveBeenCalledWith({
        name: 'PROJECTINFO',
      });
      expect(mockClientProxy.send).toHaveBeenCalledWith(
        { cmd: 'ms.jobs.phases.getAll' },
        { activeYear: '2024', riverBasin: 'test-basin' }
      );
    });

    it('should throw RpcException when project info not found', async () => {
      mockAppService.getSettings.mockResolvedValue(null);

      await expect(service.getActivityActivationTime()).rejects.toThrow(
        new RpcException('Project info not found, in SETTINGS')
      );
    });

    it('should return null when activation phase not found', async () => {
      // Reset the mock to return valid project info
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          active_year: '2024',
          river_basin: 'test-basin',
        },
      });
      mockClientProxy.send.mockReturnValue(of({ data: [] }));

      const result = await service.getActivityActivationTime();

      expect(result).toBeNull();
    });

    it('should return null when activation phase is not active', async () => {
      // Reset the mock to return valid project info
      mockAppService.getSettings.mockResolvedValue({
        name: 'PROJECTINFO',
        value: {
          active_year: '2024',
          river_basin: 'test-basin',
        },
      });
      const inactivePhaseData = {
        data: [{ name: 'ACTIVATION', isActive: false }],
      };
      mockClientProxy.send.mockReturnValue(of(inactivePhaseData));

      const result = await service.getActivityActivationTime();

      expect(result).toBeNull();
    });
  });

  describe('getDisbursementStats', () => {
    const mockBeneficiaryGroupTokens = [
      {
        numberOfTokens: 100,
        isDisbursed: true,
        beneficiaryGroup: {
          _count: { beneficiaries: 5 },
        },
        info: {
          disbursementTimeTaken: 1000,
          disbursement: {
            updated_at: '2024-01-02T00:00:00Z',
          },
        },
      },
      {
        numberOfTokens: 200,
        isDisbursed: false,
        beneficiaryGroup: {
          _count: { beneficiaries: 10 },
        },
      },
    ];

    beforeEach(() => {
      mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
        mockBeneficiaryGroupTokens
      );
      jest
        .spyOn(service as any, 'getFromSettings')
        .mockImplementation((key) => {
          if (key === 'ONE_TOKEN_PRICE') return Promise.resolve(1);
          if (key === 'ASSETCODE') return Promise.resolve('RAHAT');
          return Promise.resolve(null);
        });
      jest
        .spyOn(service, 'getActivityActivationTime')
        .mockResolvedValue('2024-01-01T00:00:00Z');
    });

    it('should return disbursement statistics', async () => {
      const result = await service.getDisbursementStats();

      expect(result).toEqual([
        { name: 'Token Disbursed', value: 100 },
        { name: 'Budget Assigned', value: 300 }, // (100 + 200) * 1
        { name: 'Token', value: 'RAHAT' },
        { name: 'Token Price', value: 1 },
        { name: 'Total Beneficiaries', value: 5 },
        { name: 'Average Disbursement time', value: expect.any(String) },
        { name: 'Average Duration', value: expect.any(String) },
      ]);
    });

    it('should handle missing activation time', async () => {
      jest.spyOn(service, 'getActivityActivationTime').mockResolvedValue(null);

      const result = await service.getDisbursementStats();

      expect(result[6]).toEqual({ name: 'Average Duration', value: 'N/A' });
    });
  });

  describe('checkBulkTrustline', () => {
    it('should add bulk trustline check job for dry mode', async () => {
      const result = await service.checkBulkTrustline('dry');

      expect(checkTrustlineQueue.add).toHaveBeenCalledWith(
        JOBS.STELLAR.CHECK_BULK_TRUSTLINE_QUEUE,
        'dry',
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: true,
          backoff: { type: 'exponential', delay: 1000 },
        })
      );
      expect(result).toEqual({ message: 'Check bulk trustline job added' });
    });

    it('should add bulk trustline check job for live mode', async () => {
      const result = await service.checkBulkTrustline('live');

      expect(checkTrustlineQueue.add).toHaveBeenCalledWith(
        JOBS.STELLAR.CHECK_BULK_TRUSTLINE_QUEUE,
        'live',
        expect.any(Object)
      );
      expect(result).toEqual({ message: 'Check bulk trustline job added' });
    });
  });

  describe('rahatFaucet', () => {
    const mockRahatFaucetDto = {
      walletAddress: 'test-wallet',
      amount: '100',
    };

    it('should successfully fund account via rahat faucet', async () => {
      const mockResult = { success: true };
      mockTransactionService.rahatFaucetService.mockResolvedValue(mockResult);

      const result = await service.rahatFaucet(mockRahatFaucetDto);

      expect(result).toEqual(mockResult);
      expect(mockTransactionService.rahatFaucetService).toHaveBeenCalledWith(
        'test-wallet',
        '100'
      );
    });

    it('should throw error on faucet failure', async () => {
      const error = new Error('Faucet failed');
      mockTransactionService.rahatFaucetService.mockRejectedValue(error);

      await expect(service.rahatFaucet(mockRahatFaucetDto)).rejects.toThrow(
        expect.objectContaining({
          message: 'Faucet failed',
        })
      );
    });
  });

  describe('internalFaucetAndTrustline', () => {
    const mockBeneficiaries = {
      wallets: [
        { address: 'wallet1' },
        { address: 'wallet2' },
        { address: 'wallet3' },
        { address: 'wallet4' },
      ],
      beneficiaryGroupId: 'group-123',
    };

    beforeEach(() => {
      jest
        .spyOn(service as any, 'getBatchSizeFromSettings')
        .mockResolvedValue(3);
    });

    it('should create batch jobs for internal faucet and trustline', async () => {
      const result = await service.internalFaucetAndTrustline(
        mockBeneficiaries
      );

      expect(result.message).toBe('Created 2 batch jobs for 4 wallets');
      expect(result.batchesCreated).toBe(2);
      expect(result.totalWallets).toBe(4);
      expect(stellarQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: JOBS.STELLAR.INTERNAL_FAUCET_TRUSTLINE_QUEUE,
            data: expect.objectContaining({
              beneficiaryGroupId: 'group-123',
              batchInfo: expect.objectContaining({
                totalWallets: 4,
                totalBatches: 2,
              }),
            }),
          }),
        ])
      );
    });

    it('should return early when no wallets provided', async () => {
      const result = await service.internalFaucetAndTrustline({
        wallets: [],
        beneficiaryGroupId: 'group-123',
      });

      expect(result.message).toBe('No wallets provided for processing');
      expect(result.batchesCreated).toBe(0);
      expect(stellarQueue.addBulk).not.toHaveBeenCalled();
    });
  });

  describe('addBulkToTokenTransferQueue', () => {
    const mockPayoutDetails = [
      {
        offrampWalletAddress: 'offramp1',
        beneficiaryWalletAddress: 'beneficiary1',
        beneficiaryBankDetails: {
          accountName: 'John Doe',
          accountNumber: '123456789',
          bankName: 'Test Bank',
        },
        payoutUUID: 'payout-uuid-1',
        payoutProcessorId: 'processor-1',
        offrampType: 'bank',
        amount: 100,
      },
      {
        offrampWalletAddress: 'offramp2',
        beneficiaryWalletAddress: 'beneficiary2',
        beneficiaryBankDetails: {
          accountName: 'Jane Smith',
          accountNumber: '987654321',
          bankName: 'Test Bank 2',
        },
        payoutUUID: 'payout-uuid-2',
        payoutProcessorId: 'processor-2',
        offrampType: 'bank',
        amount: 200,
      },
    ];

    it('should add bulk jobs to token transfer queue', async () => {
      const result = await service.addBulkToTokenTransferQueue(
        mockPayoutDetails
      );

      expect(stellarQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: JOBS.STELLAR.TRANSFER_TO_OFFRAMP,
            data: mockPayoutDetails[0],
          }),
        ])
      );
      expect(result).toEqual([{ id: 'job-123', data: {}, opts: {} }]);
    });
  });

  describe('addToTokenTransferQueue', () => {
    const mockPayoutDetail = {
      offrampWalletAddress: 'offramp1',
      beneficiaryWalletAddress: 'beneficiary1',
      beneficiaryBankDetails: {
        accountName: 'John Doe',
        accountNumber: '123456789',
        bankName: 'Test Bank',
      },
      payoutUUID: 'payout-uuid-1',
      payoutProcessorId: 'processor-1',
      offrampType: 'bank',
      amount: 100,
    };

    it('should add single job to token transfer queue', async () => {
      jest
        .spyOn(service, 'addBulkToTokenTransferQueue')
        .mockResolvedValue([{ id: 'job-123', data: {}, opts: {} } as any]);

      const result = await service.addToTokenTransferQueue(mockPayoutDetail);

      expect(service.addBulkToTokenTransferQueue).toHaveBeenCalledWith([
        mockPayoutDetail,
      ]);
      expect(result).toEqual([{ id: 'job-123', data: {}, opts: {} }]);
    });
  });

  describe('disburse', () => {
    const mockDiburseDto = {
      dName: 'test_disbursement',
      groups: ['group1', 'group2'],
    };

    const mockBeneficiaries = [
      {
        walletAddress: 'addr1',
        amount: '100',
        phone: '9841234567',
        id: 'ben1',
      },
      {
        walletAddress: 'addr2',
        amount: '200',
        phone: '9847654321',
        id: 'ben2',
      },
    ];

    beforeEach(() => {
      jest
        .spyOn(service as any, 'getBeneficiaryTokenBalance')
        .mockResolvedValue(mockBeneficiaries);
      mockDisbursementServices.createDisbursementProcess.mockResolvedValue({
        success: true,
      });
    });

    it('should successfully create a disbursement process', async () => {
      const result = await service.disburse(mockDiburseDto);
      expect(result).toEqual({ success: true });
      expect(
        mockDisbursementServices.createDisbursementProcess
      ).toHaveBeenCalled();
    });

    it('should throw error when no beneficiaries found', async () => {
      jest
        .spyOn(service as any, 'getBeneficiaryTokenBalance')
        .mockResolvedValue(null);
      await expect(service.disburse(mockDiburseDto)).rejects.toThrow(TypeError);
    });

    it('should use disbursable groups when no groups provided', async () => {
      jest
        .spyOn(service as any, 'getDisbursableGroupsUuids')
        .mockResolvedValue(['group1']);

      const result = await service.disburse({ dName: 'test' });

      expect(service['getDisbursableGroupsUuids']).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('Additional private method testing for 90%+ coverage', () => {
    describe('getGroupsFromUuid edge case', () => {
      it('should return empty array when no UUIDs provided', async () => {
        // Test via addDisbursementJobs with empty groups
        jest
          .spyOn(service as any, 'getDisbursableGroupsUuids')
          .mockResolvedValue([]);

        const result = await service.addDisbursementJobs({ dName: 'test' });

        expect(result.groups).toEqual([]);
        expect(result.message).toBe('No groups found for disbursement');
      });

      it('should return empty array when null UUIDs provided', async () => {
        // Directly test the private method
        const result = await (service as any).getGroupsFromUuid(null);
        expect(result).toEqual([]);
      });
    });

    describe('getDisbursableGroupsUuids', () => {
      it('should get disbursable groups correctly', async () => {
        const mockBenGroups = [
          { uuid: 'group-token-1', groupId: 'group-1' },
          { uuid: 'group-token-2', groupId: 'group-2' },
        ];

        mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
          mockBenGroups
        );

        const result = await (service as any).getDisbursableGroupsUuids();

        expect(result).toEqual(['group-1', 'group-2']);
        expect(
          mockPrismaService.beneficiaryGroupTokens.findMany
        ).toHaveBeenCalledWith({
          where: {
            AND: [
              { numberOfTokens: { gt: 0 } },
              { isDisbursed: false },
              { payout: { is: null } },
            ],
          },
          select: { uuid: true, groupId: true },
        });
      });
    });

    describe('getFromSettings', () => {
      it('should get setting value correctly', async () => {
        // Reset the mock to ensure it returns the expected value structure
        mockSettingsService.getPublic.mockResolvedValue({
          value: {
            ASSETCODE: 'RAHAT',
            ONE_TOKEN_PRICE: 1,
          },
        });

        const result = await (service as any).getFromSettings('ASSETCODE');
        expect(result).toBe('RAHAT');
        expect(mockSettingsService.getPublic).toHaveBeenCalledWith(
          'STELLAR_SETTINGS'
        );
      });
    });

    describe('getRecentTransaction', () => {
      it('should format transactions correctly', async () => {
        const mockTransactions = [
          {
            asset: 'RAHAT',
            source: 'source-wallet-1',
            created_at: '2024-01-01T00:00:00Z',
            amount: '100',
            amtColor: 'green',
            hash: 'tx-hash-1',
          },
          {
            asset: 'XLM',
            source: 'source-wallet-2',
            created_at: '2024-01-02T00:00:00Z',
            amount: '50',
            amtColor: 'red',
            hash: 'tx-hash-2',
          },
        ];

        mockTransactionService.getTransaction.mockResolvedValue(
          mockTransactions
        );

        const result = await (service as any).getRecentTransaction(
          'test-wallet'
        );

        expect(result).toEqual([
          {
            title: 'RAHAT',
            subtitle: 'source-wallet-1',
            date: '2024-01-01T00:00:00Z',
            amount: '100',
            amtColor: 'green',
            hash: 'tx-hash-1',
          },
          {
            title: 'XLM',
            subtitle: 'source-wallet-2',
            date: '2024-01-02T00:00:00Z',
            amount: '50',
            amtColor: 'red',
            hash: 'tx-hash-2',
          },
        ]);

        expect(mockTransactionService.getTransaction).toHaveBeenCalledWith(
          'test-wallet',
          10,
          'desc'
        );
      });
    });

    describe('getStellarObjects', () => {
      it('should create stellar objects correctly', async () => {
        // Mock the Stellar SDK components
        const mockServer = {
          test: 'server',
          getAccount: jest.fn().mockResolvedValue({ account: 'mock-account' }),
        };
        const mockKeypair = {
          publicKey: jest.fn().mockReturnValue('public-key-value'),
        };
        const mockSourceAccount = { account: 'mock-account' };
        const mockContract = { contract: 'mock-contract' };

        const { rpc } = require('@stellar/stellar-sdk');
        rpc.Server.mockImplementation(() => mockServer);
        (Keypair.fromSecret as any).mockReturnValue(mockKeypair);
        (Contract as any).mockImplementation(() => mockContract);

        const result = await (service as any).getStellarObjects();

        expect(result).toHaveProperty('server', mockServer);
        expect(result).toHaveProperty('keypair', mockKeypair);
        expect(result).toHaveProperty('publicKey', 'public-key-value');
        expect(result).toHaveProperty('sourceAccount', mockSourceAccount);
        expect(result).toHaveProperty('contract', mockContract);
      });
    });

    describe('fetchGroupedBeneficiaries and fetchGroupTokenAmounts', () => {
      it('should fetch grouped beneficiaries correctly', async () => {
        const mockResponse = {
          data: [
            { uuid: 'group1', beneficiaries: ['ben1', 'ben2'] },
            { uuid: 'group2', beneficiaries: ['ben3', 'ben4'] },
          ],
        };

        mockClientProxy.send.mockReturnValue(of(mockResponse));

        const result = await (service as any).fetchGroupedBeneficiaries([
          'group1',
          'group2',
        ]);

        expect(result).toEqual(mockResponse.data);
        expect(mockClientProxy.send).toHaveBeenCalledWith(
          { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
          { data: [{ uuid: 'group1' }, { uuid: 'group2' }] }
        );
      });

      it('should return empty array when response data is null', async () => {
        const mockResponse = { data: null };
        mockClientProxy.send.mockReturnValue(of(mockResponse));

        const result = await (service as any).fetchGroupedBeneficiaries([
          'group1',
        ]);

        expect(result).toEqual([]);
      });

      it('should fetch group token amounts correctly', async () => {
        const mockTokens = [
          { numberOfTokens: 100, groupId: 'group1' },
          { numberOfTokens: 200, groupId: 'group2' },
        ];

        mockPrismaService.beneficiaryGroupTokens.findMany.mockResolvedValue(
          mockTokens
        );

        const result = await (service as any).fetchGroupTokenAmounts([
          'group1',
          'group2',
        ]);

        expect(result).toEqual(mockTokens);
        expect(
          mockPrismaService.beneficiaryGroupTokens.findMany
        ).toHaveBeenCalledWith({
          where: { groupId: { in: ['group1', 'group2'] } },
          select: { numberOfTokens: true, groupId: true },
        });
      });
    });

    describe('computeBeneficiaryTokenDistribution', () => {
      it('should compute token distribution correctly', async () => {
        const mockGroups = [
          {
            uuid: 'group1',
            _count: { groupedBeneficiaries: 2 },
            groupedBeneficiaries: [
              {
                Beneficiary: {
                  uuid: 'ben1',
                  walletAddress: 'wallet1',
                  pii: { phone: '123456789' },
                },
              },
              {
                Beneficiary: {
                  uuid: 'ben2',
                  walletAddress: 'wallet2',
                  pii: { phone: '987654321' },
                },
              },
            ],
          },
        ];

        const mockTokens = [{ numberOfTokens: 200, groupId: 'group1' }];

        const result = await (
          service as any
        ).computeBeneficiaryTokenDistribution(mockGroups, mockTokens);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          phone: '123456789',
          walletAddress: 'wallet1',
          amount: '100',
          id: 'ben1',
        });
        expect(result[1]).toEqual({
          phone: '987654321',
          walletAddress: 'wallet2',
          amount: '100',
          id: 'ben2',
        });
      });

      it('should handle overlapping beneficiaries correctly', async () => {
        const mockGroups = [
          {
            uuid: 'group1',
            _count: { groupedBeneficiaries: 1 },
            groupedBeneficiaries: [
              {
                Beneficiary: {
                  uuid: 'ben1',
                  walletAddress: 'wallet1',
                  pii: { phone: '123456789' }, // Same phone in multiple groups
                },
              },
            ],
          },
          {
            uuid: 'group2',
            _count: { groupedBeneficiaries: 1 },
            groupedBeneficiaries: [
              {
                Beneficiary: {
                  uuid: 'ben1',
                  walletAddress: 'wallet1',
                  pii: { phone: '123456789' }, // Same phone again
                },
              },
            ],
          },
        ];

        const mockTokens = [
          { numberOfTokens: 100, groupId: 'group1' },
          { numberOfTokens: 50, groupId: 'group2' },
        ];

        const result = await (
          service as any
        ).computeBeneficiaryTokenDistribution(mockGroups, mockTokens);

        expect(result).toHaveLength(1); // Should merge the same phone
        expect(result[0]).toEqual({
          phone: '123456789',
          walletAddress: 'wallet1',
          amount: '150', // 100 + 50 combined
          id: 'ben1',
        });
      });
    });
  });

  describe('sendOtp', () => {
    const mockSendOtpDto = {
      phoneNumber: '+1234567890',
      amount: '100',
      vendorUuid: 'vendor-uuid-123',
    };

    const mockPayoutType = {
      uuid: 'payout-uuid-123',
      type: 'VENDOR',
      mode: 'ONLINE',
    };

    const mockVendor = {
      uuid: 'vendor-uuid-123',
      walletAddress: 'vendor-wallet-address',
    };

    const mockBeneficiaryKeys = {
      address: 'beneficiary-address',
      publicKey: 'beneficiary-public-key',
      privateKey: 'beneficiary-private-key',
    };

    beforeEach(() => {
      // Set up the spy for getBeneficiaryPayoutTypeByPhone first
      jest
        .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
        .mockResolvedValue(mockPayoutType);
      jest.spyOn(service as any, 'getBenTotal').mockResolvedValue(1000);
      jest
        .spyOn(service as any, 'getSecretByPhone')
        .mockResolvedValue(mockBeneficiaryKeys);
      jest.spyOn(service as any, 'storeOTP').mockResolvedValue({ id: 1 });

      // Mock the external dependencies
      mockClientProxy.send.mockReturnValue(of({ otp: '123456' }));
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedOtp');
      mockPrismaService.otp.upsert.mockResolvedValue({ id: 1 });
      mockPrismaService.vendor.findUnique.mockResolvedValue(mockVendor);
      mockPrismaService.beneficiaryRedeem.findFirst.mockResolvedValue(null);
      mockPrismaService.beneficiaryRedeem.create.mockResolvedValue({
        uuid: 'redeem-uuid',
      });
    });

    it('should successfully send and store OTP', async () => {
      const result = await service.sendOtp(mockSendOtpDto);
      expect(result).toEqual({ id: 1 });
      expect(mockClientProxy.send).toHaveBeenCalled();
      expect(service['getBeneficiaryPayoutTypeByPhone']).toHaveBeenCalledWith(
        mockSendOtpDto.phoneNumber
      );
      expect(service['storeOTP']).toHaveBeenCalled();
    });

    it('should throw RpcException if payout type is not VENDOR', async () => {
      jest
        .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
        .mockResolvedValue({
          ...mockPayoutType,
          type: 'CASH',
        });

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout type is not VENDOR')
      );
    });

    it('should throw RpcException if payout mode is not ONLINE', async () => {
      jest
        .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
        .mockResolvedValue({
          ...mockPayoutType,
          mode: 'OFFLINE',
        });

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout mode is not ONLINE')
      );
    });

    it('should throw RpcException if payout not initiated', async () => {
      jest
        .spyOn(service as any, 'getBeneficiaryPayoutTypeByPhone')
        .mockResolvedValue(null);

      await expect(service.sendOtp(mockSendOtpDto)).rejects.toThrow(
        new RpcException('Payout not initiated')
      );
    });
  });
});
