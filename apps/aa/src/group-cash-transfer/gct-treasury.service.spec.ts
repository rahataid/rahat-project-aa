import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { GctTreasuryService } from './gct-treasury.service';
import { AppService } from '../app/app.service';

const mockStellarClient = {
  getBalance: jest.fn(),
  sendPayment: jest.fn(),
};

jest.mock('@rahataid/stellar', () => ({
  StellarClient: jest.fn().mockImplementation(() => mockStellarClient),
  Asset: jest.fn().mockImplementation((code, issuer) => ({ code, issuer })),
}));

const mockContract = {
  balanceOf: jest.fn(),
  decimals: jest.fn().mockResolvedValue(18),
  transfer: jest.fn(),
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
      Wallet: jest.fn().mockImplementation(() => ({})),
      Contract: jest.fn().mockImplementation(() => mockContract),
      formatUnits: actual.ethers.formatUnits,
      parseUnits: actual.ethers.parseUnits,
    },
  };
});

const STELLAR_PUBLIC_KEY = 'G'.repeat(56);
const EVM_PUBLIC_KEY = '0x' + '1'.repeat(40);

const chainSettingsValue = (type: string) => ({
  value: { type, rpcurl: 'https://rpc.example.com', chainid: 'testnet passphrase' },
});

describe('GctTreasuryService', () => {
  let service: GctTreasuryService;
  let getSettings: jest.Mock;

  const setup = async (chainType: string, gctPublicKey: string, gctToken: string) => {
    getSettings = jest.fn(async ({ name }: { name: string }) => {
      if (name === 'CHAIN_SETTINGS') return chainSettingsValue(chainType);
      if (name === 'GCT_TREASURY') {
        return {
          value: { gct_token: gctToken, gct_secret_key: 'SECRET', gct_public_key: gctPublicKey },
        };
      }
      return null;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GctTreasuryService, { provide: AppService, useValue: { getSettings } }],
    }).compile();

    service = module.get<GctTreasuryService>(GctTreasuryService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockContract.decimals.mockResolvedValue(18);
  });

  describe('onModuleInit chain/key mismatch', () => {
    it('blocks all operations when GCT_PUBLIC_KEY is stellar but active chain is evm', async () => {
      await setup('evm', STELLAR_PUBLIC_KEY, '0x' + '2'.repeat(40));

      await service.onModuleInit();

      await expect(service.getBalance()).rejects.toThrow(RpcException);
      await expect(service.getTreasuryInfo()).rejects.toThrow(RpcException);
      await expect(service.transfer('0xdest', 10)).rejects.toThrow(RpcException);
    });

    it('does not block when GCT_PUBLIC_KEY matches the active evm chain', async () => {
      await setup('evm', EVM_PUBLIC_KEY, '0x' + '2'.repeat(40));
      mockContract.balanceOf.mockResolvedValue(BigInt(1000e18));

      await service.onModuleInit();

      await expect(service.getBalance()).resolves.toBe(1000);
    });
  });

  describe('evm getBalance/transfer', () => {
    beforeEach(async () => {
      await setup('evm', EVM_PUBLIC_KEY, '0x' + '2'.repeat(40));
      await service.onModuleInit();
    });

    it('reads ERC-20 balance formatted by decimals', async () => {
      mockContract.balanceOf.mockResolvedValue(BigInt(2500e18));

      const balance = await service.getBalance();

      expect(balance).toBe(2500);
    });

    it('transfers tokens and returns the tx hash', async () => {
      mockContract.transfer.mockResolvedValue({ wait: async () => ({ hash: '0xhash' }) });

      const hash = await service.transfer('0xdestination', 100);

      expect(hash).toBe('0xhash');
    });
  });

  describe('stellar getBalance/transfer', () => {
    beforeEach(async () => {
      await setup('stellar', STELLAR_PUBLIC_KEY, 'RAHAT:GISSUER');
      await service.onModuleInit();
    });

    it('reads stellar asset balance', async () => {
      mockStellarClient.getBalance.mockResolvedValue('750');

      const balance = await service.getBalance();

      expect(balance).toBe(750);
    });

    it('transfers via sendPayment and returns the tx hash', async () => {
      mockStellarClient.sendPayment.mockResolvedValue({ hash: 'stellar-hash', successful: true });

      const hash = await service.transfer('GDEST', 50);

      expect(hash).toBe('stellar-hash');
    });
  });
});
