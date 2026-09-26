import { StellarChainService } from './stellar-chain.service';

describe('StellarChainService.processReturnTokens', () => {
  const payoutRow = (tokenReturn?: any) => ({
    uuid: 'p1',
    extras: { skippedAt: 'x', ...(tokenReturn ? { tokenReturn } : {}) },
  });
  const prisma: any = {
    payouts: { findUnique: jest.fn(), update: jest.fn() },
  };
  let service: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new (StellarChainService as any)({}, {}, {}, {}, prisma, {}, {}, {}, {});
    prisma.payouts.findUnique.mockResolvedValue(payoutRow());
  });

  const savedState = (call = 0) =>
    prisma.payouts.update.mock.calls[call][0].data.extras.tokenReturn;

  it('skips wallets already returned and caps amount', async () => {
    prisma.payouts.findUnique.mockResolvedValue(
      payoutRow({ returned: { W1: 'H0' } })
    );
    const spy = jest
      .spyOn(service, 'returnTokensToDistributionWallet')
      .mockResolvedValue([{ walletAddress: 'W2', amount: '10', txHash: 'H1' }]);

    await service.processReturnTokens(
      { payoutUuid: 'p1', wallets: ['W1', 'W2'], amountPerWallet: 10 },
      true
    );

    expect(spy).toHaveBeenCalledWith(['W2'], 10);
    expect(savedState()).toMatchObject({
      status: 'COMPLETED',
      returned: { W1: 'H0', W2: 'H1' },
    });
  });

  it('persists partial progress and throws to trigger retry', async () => {
    jest.spyOn(service, 'returnTokensToDistributionWallet').mockResolvedValue([
      { walletAddress: 'W1', amount: '10', txHash: 'H1' },
      { walletAddress: 'W2', amount: '10', error: 'tx_bad_seq' },
    ]);

    await expect(
      service.processReturnTokens(
        { payoutUuid: 'p1', wallets: ['W1', 'W2'] },
        false
      )
    ).rejects.toThrow('tx_bad_seq');

    expect(savedState()).toMatchObject({
      status: 'RETRYING',
      returned: { W1: 'H1' },
      failedWallets: ['W2'],
    });
  });

  it('marks FAILED on the last attempt', async () => {
    jest
      .spyOn(service, 'returnTokensToDistributionWallet')
      .mockRejectedValue(new Error('no secret'));

    await expect(
      service.processReturnTokens({ payoutUuid: 'p1', wallets: ['W1'] }, true)
    ).rejects.toThrow('no secret');

    expect(savedState()).toMatchObject({ status: 'FAILED', error: 'no secret' });
  });
});
