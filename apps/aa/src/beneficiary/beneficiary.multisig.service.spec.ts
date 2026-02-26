import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiaryMultisigService } from './beneficiary.multisig.service';
import { PrismaService } from '@rumsan/prisma';
import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import * as web3Utils from '../utils/web3';
import { OperationType } from '@safe-global/safe-core-sdk-types';

// Mock Safe modules
jest.mock('@safe-global/api-kit');
jest.mock('@safe-global/protocol-kit');

// Mock web3 utils
jest.mock('../utils/web3', () => ({
  createContractInstance: jest.fn(),
  getWalletFromPrivateKey: jest.fn(),
}));

describe('BeneficiaryMultisigService', () => {
  let service: BeneficiaryMultisigService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    setting: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };

  const mockSafeInstance = {
    getBalance: jest.fn(),
    createTransaction: jest.fn(),
    getTransactionHash: jest.fn(),
    signHash: jest.fn(),
    getAddress: jest.fn(),
  };

  const mockSafeApiKit = {
    getSafeInfo: jest.fn(),
    getMultisigTransactions: jest.fn(),
    getPendingTransactions: jest.fn(),
    proposeTransaction: jest.fn(),
  };

  const mockContract = {
    balanceOf: {
      staticCall: jest.fn(),
    },
    decimals: {
      staticCall: jest.fn(),
    },
    interface: {
      encodeFunctionData: jest.fn(),
    },
  };

  const mockWallet = {
    address: '0xProposerWalletAddress',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset Safe.init mock
    (Safe.init as jest.Mock).mockResolvedValue(mockSafeInstance);

    // Reset SafeApiKit constructor mock
    (SafeApiKit as jest.Mock).mockImplementation(() => mockSafeApiKit);

    // Reset web3 utils mocks
    (web3Utils.createContractInstance as jest.Mock).mockResolvedValue(
      mockContract
    );
    (web3Utils.getWalletFromPrivateKey as jest.Mock).mockReturnValue(
      mockWallet
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeneficiaryMultisigService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BeneficiaryMultisigService>(
      BeneficiaryMultisigService
    );
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    const mockFundManagementConfig = {
      value: {
        tabs: [{ value: 'multisigWallet' }],
      },
    };

    const mockChainSettings = {
      value: {
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
      },
    };

    const mockSafeProposerPrivateKey = {
      value: '0xPrivateKey123',
    };

    const mockSafeApiKey = {
      value: 'safe-api-key-123',
    };

    it('should initialize SafeApiKit when source is gnosis', async () => {
      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig) // FUNDMANAGEMENT_TAB_CONFIG
        .mockResolvedValueOnce(mockChainSettings) // CHAIN_SETTINGS
        .mockResolvedValueOnce(mockSafeProposerPrivateKey) // SAFE_PROPOSER_PRIVATE_ADDRESS
        .mockResolvedValueOnce(mockSafeApiKey); // SAFE_API_KEY

      await service.onModuleInit();

      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledWith({
        where: { name: 'FUNDMANAGEMENT_TAB_CONFIG' },
      });
      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledWith({
        where: { name: 'CHAIN_SETTINGS' },
      });
      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledWith({
        where: { name: 'SAFE_PROPOSER_PRIVATE_ADDRESS' },
      });
      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledWith({
        where: { name: 'SAFE_API_KEY' },
      });
      expect(SafeApiKit).toHaveBeenCalledWith({
        chainId: BigInt(84532),
        apiKey: 'safe-api-key-123',
      });
    });

    it('should return early when source is not gnosis', async () => {
      const nonGnosisConfig = {
        value: {
          tabs: [{ value: 'otherWallet' }],
        },
      };

      mockPrismaService.setting.findFirst.mockResolvedValueOnce(
        nonGnosisConfig
      );

      await service.onModuleInit();

      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledTimes(1);
      expect(SafeApiKit).not.toHaveBeenCalled();
    });

    it('should return early when fundManagementConfig has no tabs', async () => {
      const noTabsConfig = {
        value: {},
      };

      mockPrismaService.setting.findFirst.mockResolvedValueOnce(noTabsConfig);

      await service.onModuleInit();

      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledTimes(1);
      expect(SafeApiKit).not.toHaveBeenCalled();
    });

    it('should throw error when required settings are missing', async () => {
      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(null) // CHAIN_SETTINGS missing
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await expect(service.onModuleInit()).rejects.toThrow(
        'CHAIN_SETTINGS, SAFE_PROPOSER_PRIVATE_ADDRESS or SAFE_API_KEY may be missing'
      );
    });

    it('should throw error when safeProposerPrivateKey is missing', async () => {
      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(null) // SAFE_PROPOSER_PRIVATE_ADDRESS missing
        .mockResolvedValueOnce(mockSafeApiKey);

      await expect(service.onModuleInit()).rejects.toThrow(
        'CHAIN_SETTINGS, SAFE_PROPOSER_PRIVATE_ADDRESS or SAFE_API_KEY may be missing'
      );
    });

    it('should throw error when safeApiKey is missing', async () => {
      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(null); // SAFE_API_KEY missing

      await expect(service.onModuleInit()).rejects.toThrow(
        'CHAIN_SETTINGS, SAFE_PROPOSER_PRIVATE_ADDRESS or SAFE_API_KEY may be missing'
      );
    });
  });

  describe('getSafeInstance', () => {
    beforeEach(async () => {
      // Initialize service with required settings
      const mockFundManagementConfig = {
        value: { tabs: [{ value: 'multisigWallet' }] },
      };
      const mockChainSettings = {
        value: { chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
      };
      const mockSafeProposerPrivateKey = { value: '0xPrivateKey123' };
      const mockSafeApiKey = { value: 'safe-api-key-123' };

      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should return Safe instance with correct configuration', async () => {
      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);

      const result = await service.getSafeInstance();

      expect(mockPrismaService.setting.findFirst).toHaveBeenCalledWith({
        where: { name: 'SAFE_WALLET' },
      });
      expect(Safe.init).toHaveBeenCalledWith({
        provider: 'https://sepolia.base.org',
        signer: '0xPrivateKey123',
        safeAddress: '0xSafeWalletAddress',
      });
      expect(result).toBe(mockSafeInstance);
    });
  });

  describe('getOwnersList', () => {
    beforeEach(async () => {
      // Initialize service
      const mockFundManagementConfig = {
        value: { tabs: [{ value: 'multisigWallet' }] },
      };
      const mockChainSettings = {
        value: { chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
      };
      const mockSafeProposerPrivateKey = { value: '0xPrivateKey123' };
      const mockSafeApiKey = { value: 'safe-api-key-123' };

      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await service.onModuleInit();

      // Set up safeApiKit on service instance
      (service as any).safeApiKit = mockSafeApiKit;

      jest.clearAllMocks();
    });

    it('should return safe info with balances and transactions', async () => {
      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockSafeDetails = {
        address: '0xSafeWalletAddress',
        owners: ['0xOwner1', '0xOwner2'],
        threshold: 2,
      };

      const mockMultisigTxns = {
        results: [
          {
            to: '0xTokenAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: '2024-01-01',
          },
          {
            to: '0xTokenAddress',
            dataDecoded: { method: 'approve' },
            executionDate: '2024-01-02',
          },
          {
            to: '0xOtherAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: '2024-01-03',
          },
        ],
      };

      const mockPendingTxns = {
        count: 2,
        results: [{ safeTxHash: '0xPendingTx1' }],
      };

      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);
      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      mockSafeInstance.getBalance.mockResolvedValue(
        BigInt('1000000000000000000')
      ); // 1 ETH
      mockSafeApiKit.getSafeInfo.mockResolvedValue(mockSafeDetails);
      mockSafeApiKit.getMultisigTransactions.mockResolvedValue(
        mockMultisigTxns
      );
      mockSafeApiKit.getPendingTransactions.mockResolvedValue(mockPendingTxns);

      mockContract.balanceOf.staticCall
        .mockResolvedValueOnce(BigInt('5000000000000000000')) // Project balance: 5 tokens
        .mockResolvedValueOnce(BigInt('10000000000000000000')); // Safe balance: 10 tokens
      mockContract.decimals.staticCall.mockResolvedValue(BigInt(18));

      const result = await service.getOwnersList();

      expect(result).toEqual({
        ...mockSafeDetails,
        nativeBalance: '1.0',
        tokenBalance: '10.0',
        projectBalance: '5.0',
        decimals: 18,
        pendingTxCount: 2,
        transfers: [
          { safeTxHash: '0xPendingTx1' },
          {
            to: '0xTokenAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: '2024-01-01',
          },
        ],
      });
    });

    it('should handle errors gracefully and log them', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockPrismaService.setting.findFirst.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.getOwnersList();

      expect(consoleSpy).toHaveBeenCalled();
      expect(result).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should filter only successful transfer transactions', async () => {
      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockMultisigTxns = {
        results: [
          {
            to: '0xTokenAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: '2024-01-01',
          },
          {
            to: '0xTokenAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: null, // Not executed yet
          },
          {
            to: '0xOtherAddress',
            dataDecoded: { method: 'transfer' },
            executionDate: '2024-01-03',
          },
        ],
      };

      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);
      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      mockSafeInstance.getBalance.mockResolvedValue(
        BigInt('1000000000000000000')
      );
      mockSafeApiKit.getSafeInfo.mockResolvedValue({ address: '0xSafe' });
      mockSafeApiKit.getMultisigTransactions.mockResolvedValue(
        mockMultisigTxns
      );
      mockSafeApiKit.getPendingTransactions.mockResolvedValue({
        count: 0,
        results: [],
      });

      mockContract.balanceOf.staticCall.mockResolvedValue(BigInt('0'));
      mockContract.decimals.staticCall.mockResolvedValue(BigInt(18));

      const result = await service.getOwnersList();

      // Only the first transaction should be in transfers (executed + to token address + transfer method)
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].executionDate).toBe('2024-01-01');
    });
  });

  describe('generateTransactionData', () => {
    beforeEach(async () => {
      // Initialize service
      const mockFundManagementConfig = {
        value: { tabs: [{ value: 'multisigWallet' }] },
      };
      const mockChainSettings = {
        value: { chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
      };
      const mockSafeProposerPrivateKey = { value: '0xPrivateKey123' };
      const mockSafeApiKey = { value: 'safe-api-key-123' };

      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await service.onModuleInit();
      jest.clearAllMocks();
    });

    it('should generate correct transaction data for token transfer', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      // Mock ethers.Contract
      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedData'),
        },
      };

      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      const result = await service.generateTransactionData('100');

      expect(mockPrismaService.setting.findUnique).toHaveBeenCalledWith({
        where: { name: 'CONTRACTS' },
      });
      expect(result).toEqual({
        to: '0xTokenAddress',
        value: '0',
        data: '0xEncodedData',
        operation: OperationType.Call,
      });
    });
  });

  describe('createSafeTransaction', () => {
    beforeEach(async () => {
      // Initialize service
      const mockFundManagementConfig = {
        value: { tabs: [{ value: 'multisigWallet' }] },
      };
      const mockChainSettings = {
        value: { chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
      };
      const mockSafeProposerPrivateKey = { value: '0xPrivateKey123' };
      const mockSafeApiKey = { value: 'safe-api-key-123' };

      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await service.onModuleInit();

      // Set up safeApiKit
      (service as any).safeApiKit = mockSafeApiKit;

      jest.clearAllMocks();
    });

    it('should create and propose a safe transaction successfully', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockSafeTransaction = {
        data: {
          to: '0xTokenAddress',
          value: '0',
          data: '0xEncodedData',
        },
      };

      const mockSignature = {
        data: '0xSignatureData',
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);
      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);

      // Mock ethers.Contract for generateTransactionData
      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedData'),
        },
      };
      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      mockSafeInstance.createTransaction.mockResolvedValue(mockSafeTransaction);
      mockSafeInstance.getTransactionHash.mockResolvedValue('0xSafeTxHash');
      mockSafeInstance.signHash.mockResolvedValue(mockSignature);
      mockSafeInstance.getAddress.mockResolvedValue('0xSafeWalletAddress');
      mockSafeApiKit.proposeTransaction.mockResolvedValue(undefined);

      const result = await service.createSafeTransaction({ amount: '100' });

      expect(result).toEqual({
        safeAddress: '0xSafeWalletAddress',
        safeTransactionData: mockSafeTransaction.data,
        safeTxHash: '0xSafeTxHash',
        senderAddress: '0xProposerWalletAddress',
        senderSignature: '0xSignatureData',
      });

      expect(mockSafeInstance.createTransaction).toHaveBeenCalled();
      expect(mockSafeInstance.getTransactionHash).toHaveBeenCalledWith(
        mockSafeTransaction
      );
      expect(mockSafeInstance.signHash).toHaveBeenCalledWith('0xSafeTxHash');
      expect(mockSafeApiKit.proposeTransaction).toHaveBeenCalledWith({
        safeAddress: '0xSafeWalletAddress',
        safeTransactionData: mockSafeTransaction.data,
        safeTxHash: '0xSafeTxHash',
        senderAddress: '0xProposerWalletAddress',
        senderSignature: '0xSignatureData',
      });
    });

    it('should throw error when transaction creation fails', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);
      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);

      // Mock ethers.Contract
      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedData'),
        },
      };
      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      const error = new Error('Transaction creation failed');
      mockSafeInstance.createTransaction.mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(
        service.createSafeTransaction({ amount: '100' })
      ).rejects.toThrow('Transaction creation failed');

      expect(consoleSpy).toHaveBeenCalledWith(error);

      consoleSpy.mockRestore();
    });

    it('should throw error when proposeTransaction fails', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockSafeTransaction = {
        data: {
          to: '0xTokenAddress',
          value: '0',
          data: '0xEncodedData',
        },
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);
      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);

      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedData'),
        },
      };
      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      mockSafeInstance.createTransaction.mockResolvedValue(mockSafeTransaction);
      mockSafeInstance.getTransactionHash.mockResolvedValue('0xSafeTxHash');
      mockSafeInstance.signHash.mockResolvedValue({ data: '0xSignatureData' });
      mockSafeInstance.getAddress.mockResolvedValue('0xSafeWalletAddress');

      const error = new Error('Propose transaction failed');
      mockSafeApiKit.proposeTransaction.mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(
        service.createSafeTransaction({ amount: '100' })
      ).rejects.toThrow('Propose transaction failed');

      expect(consoleSpy).toHaveBeenCalledWith(error);

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      // Initialize service
      const mockFundManagementConfig = {
        value: { tabs: [{ value: 'multisigWallet' }] },
      };
      const mockChainSettings = {
        value: { chainId: 84532, rpcUrl: 'https://sepolia.base.org' },
      };
      const mockSafeProposerPrivateKey = { value: '0xPrivateKey123' };
      const mockSafeApiKey = { value: 'safe-api-key-123' };

      mockPrismaService.setting.findFirst
        .mockResolvedValueOnce(mockFundManagementConfig)
        .mockResolvedValueOnce(mockChainSettings)
        .mockResolvedValueOnce(mockSafeProposerPrivateKey)
        .mockResolvedValueOnce(mockSafeApiKey);

      await service.onModuleInit();
      (service as any).safeApiKit = mockSafeApiKit;
      jest.clearAllMocks();
    });

    it('should handle zero amount in generateTransactionData', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedData'),
        },
      };
      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      const result = await service.generateTransactionData('0');

      expect(result.value).toBe('0');
      expect(result.operation).toBe(OperationType.Call);
    });

    it('should handle decimal amounts in generateTransactionData', async () => {
      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      const mockTokenContract = {
        decimals: jest.fn().mockResolvedValue(BigInt(18)),
        interface: {
          encodeFunctionData: jest.fn().mockReturnValue('0xEncodedDecimalData'),
        },
      };
      jest
        .spyOn(ethers, 'Contract')
        .mockImplementation(() => mockTokenContract as any);

      const result = await service.generateTransactionData('100.5');

      expect(result.data).toBe('0xEncodedDecimalData');
    });

    it('should handle empty multisig transactions list', async () => {
      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);
      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      mockSafeInstance.getBalance.mockResolvedValue(BigInt('0'));
      mockSafeApiKit.getSafeInfo.mockResolvedValue({ address: '0xSafe' });
      mockSafeApiKit.getMultisigTransactions.mockResolvedValue({ results: [] });
      mockSafeApiKit.getPendingTransactions.mockResolvedValue({
        count: 0,
        results: [],
      });

      mockContract.balanceOf.staticCall.mockResolvedValue(BigInt('0'));
      mockContract.decimals.staticCall.mockResolvedValue(BigInt(18));

      const result = await service.getOwnersList();

      expect(result.transfers).toEqual([]);
      expect(result.pendingTxCount).toBe(0);
    });

    it('should handle transactions with null dataDecoded', async () => {
      const mockSafeWallet = {
        value: { ADDRESS: '0xSafeWalletAddress' },
      };

      const mockContracts = {
        value: {
          AAPROJECT: { ADDRESS: '0xAAProjectAddress' },
          RAHATTOKEN: { ADDRESS: '0xTokenAddress' },
        },
      };

      const mockMultisigTxns = {
        results: [
          {
            to: '0xTokenAddress',
            dataDecoded: null,
            executionDate: '2024-01-01',
          },
        ],
      };

      mockPrismaService.setting.findFirst.mockResolvedValue(mockSafeWallet);
      mockPrismaService.setting.findUnique.mockResolvedValue(mockContracts);

      mockSafeInstance.getBalance.mockResolvedValue(BigInt('0'));
      mockSafeApiKit.getSafeInfo.mockResolvedValue({ address: '0xSafe' });
      mockSafeApiKit.getMultisigTransactions.mockResolvedValue(
        mockMultisigTxns
      );
      mockSafeApiKit.getPendingTransactions.mockResolvedValue({
        count: 0,
        results: [],
      });

      mockContract.balanceOf.staticCall.mockResolvedValue(BigInt('0'));
      mockContract.decimals.staticCall.mockResolvedValue(BigInt(18));

      const result = await service.getOwnersList();

      // Transaction with null dataDecoded should not appear in filtered transfers
      expect(result.transfers).toEqual([]);
    });
  });
});
