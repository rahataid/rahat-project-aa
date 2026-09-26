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

describe('StellarChainService.getBeneficiaryPayoutTypeByPhone', () => {
  const findMany = jest.fn();
  const send = jest.fn();
  let service: any;

  const groupsOf = (...ids: string[]) => ({
    groupedBeneficiaries: ids.map((id) => ({
      beneficiaryGroupId: id,
      groupPurpose: 'GENERAL',
    })),
  });
  const token = (uuid: string, status: string, extras: any = null, isDisbursed = true) => ({
    uuid,
    isDisbursed,
    payout: { uuid: `payout-${uuid}`, status, extras },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new (StellarChainService as any)(
      {}, {}, {}, {},
      { beneficiaryGroups: { findMany } },
      {},
      { send },
      {},
      {}
    );
  });

  const run = (benf: any) => {
    send.mockReturnValue({ subscribe: (o: any) => { o.next(benf); o.complete(); } });
    return service.getBeneficiaryPayoutTypeByPhone('+977');
  };

  it('picks the group with the active payout when in several groups', async () => {
    findMany.mockResolvedValue([
      { uuid: 'old', tokensReserved: [token('t1', 'FAILED', { skippedAt: 'x' })] },
      { uuid: 'new', tokensReserved: [token('t2', 'PENDING')] },
    ]);
    const payout = await run(groupsOf('old', 'new'));
    expect(payout.uuid).toBe('payout-t2');
  });

  it('still rejects when active payouts exist in more than one group', async () => {
    findMany.mockResolvedValue([
      { uuid: 'a', tokensReserved: [token('t1', 'PENDING')] },
      { uuid: 'b', tokensReserved: [token('t2', 'PENDING')] },
    ]);
    await expect(run(groupsOf('a', 'b'))).rejects.toMatchObject({
      error: { code: 'MULTIPLE_PAYOUT_ELIGIBLE_GROUPS_FOUND' },
    });
  });

  it('rejects with no active payout when the only token is skipped', async () => {
    findMany.mockResolvedValue([
      { uuid: 'old', tokensReserved: [token('t1', 'FAILED', { skippedAt: 'x' })] },
    ]);
    await expect(run(groupsOf('old'))).rejects.toMatchObject({
      error: { code: 'NO_ACTIVE_PAYOUT_FOUND_FOR_GROUP' },
    });
  });
});
