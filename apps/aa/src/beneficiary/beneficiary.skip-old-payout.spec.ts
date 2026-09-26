import { BeneficiaryService } from './beneficiary.service';

describe('BeneficiaryService skipOldPayoutForRemaining', () => {
  const GROUP = 'group-1';
  const order: string[] = [];

  const tx = {
    beneficiaryRedeem: {
      updateMany: jest.fn<any, any[]>(async () => order.push('tx.redeem.updateMany')),
      createMany: jest.fn<any, any[]>(async () =>
        order.push('tx.redeem.createMany')
      ),
    },
    payouts: {
      update: jest.fn<any, any[]>(async () => order.push('tx.payout.update')),
    },
  };
  const prisma: any = {
    rsclient: {},
    beneficiaryGroupTokens: { findMany: jest.fn() },
    beneficiaryGroups: { findMany: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(tx)),
  };
  const settings = { getPublic: jest.fn() };
  const payoutService = { checkAndCompletePayout: jest.fn() };
  const chain = {
    queueReturnTokens: jest.fn<any, any[]>(),
    setTokenReturnState: jest.fn<any, any[]>(),
  };
  const moduleRef = { get: jest.fn(() => chain) };

  let service: any;

  const openPayout = (extras: any = null) => ({
    uuid: 'payout-1',
    type: 'VENDOR',
    status: 'PENDING',
    extras,
    beneficiaryRedeem: [
      // W1 fully paid, W2 pending, W3 has no row
      { uuid: 'r1', beneficiaryWalletAddress: 'W1', status: 'COMPLETED', info: null },
      { uuid: 'r2', beneficiaryWalletAddress: 'W2', status: 'PENDING', info: { a: 1 } },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    service = new (BeneficiaryService as any)(
      prisma,
      settings,
      {},
      {},
      {},
      payoutService,
      {},
      {},
      moduleRef
    );
    settings.getPublic.mockResolvedValue({ value: { type: 'stellar' } });
    jest.spyOn(service, 'getOneGroup').mockResolvedValue({
      name: 'G',
      groupedBeneficiaries: ['W1', 'W2', 'W3'].map((w) => ({
        Beneficiary: { uuid: `b-${w}`, walletAddress: w },
      })),
    });
    chain.queueReturnTokens.mockImplementation(async () => {
      order.push('chain.queue');
    });
  });

  it('returns tokens for remaining only, then cancels redeems and marks payout', async () => {
    prisma.beneficiaryGroupTokens.findMany.mockResolvedValue([
      { numberOfTokens: 30, payout: openPayout() },
    ]);

    await service.skipOldPayoutForRemaining(GROUP, { name: 'admin' });

    // 30 tokens / 3 beneficiaries = 10 each; queued for remaining wallets only
    expect(chain.queueReturnTokens).toHaveBeenCalledWith({
      payoutUuid: 'payout-1',
      wallets: ['W2', 'W3'],
      amountPerWallet: 10,
    });
    // one bulk update (W2 only, W1 is paid) — never one statement per beneficiary
    expect(tx.beneficiaryRedeem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.beneficiaryRedeem.updateMany.mock.calls[0][0]).toMatchObject({
      where: { uuid: { in: ['r2'] } },
      data: { status: 'CANCELLED', isCompleted: false },
    });
    expect(tx.beneficiaryRedeem.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        beneficiaryWalletAddress: 'W3',
        status: 'CANCELLED',
        transactionType: 'VENDOR_REIMBURSEMENT',
        payoutId: 'payout-1',
      }),
    ]);
    expect(tx.payouts.update.mock.calls[0][0].data.extras).toMatchObject({
      skippedBy: 'admin',
      tokenReturn: { status: 'QUEUED' },
    });
    expect(tx.payouts.update.mock.calls[0][0].data.extras.skippedAt).toBeTruthy();
    expect(payoutService.checkAndCompletePayout).toHaveBeenCalledWith('payout-1');
    // DB marking is committed before the job is queued
    expect(order[order.length - 1]).toBe('chain.queue');
  });

  it('uses bulk statements for 1000 beneficiaries (no per-row transaction loop)', async () => {
    const wallets = Array.from({ length: 1000 }, (_, i) => `W${i}`);
    (service.getOneGroup as jest.Mock).mockResolvedValue({
      name: 'G',
      groupedBeneficiaries: wallets.map((w) => ({ Beneficiary: { walletAddress: w } })),
    });
    prisma.beneficiaryGroupTokens.findMany.mockResolvedValue([
      {
        numberOfTokens: 1000,
        payout: {
          ...openPayout(),
          beneficiaryRedeem: wallets.slice(0, 500).map((w) => ({
            uuid: `r-${w}`,
            beneficiaryWalletAddress: w,
            status: 'PENDING',
            info: null,
          })),
        },
      },
    ]);

    await service.skipOldPayoutForRemaining(GROUP);

    expect(tx.beneficiaryRedeem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.beneficiaryRedeem.updateMany.mock.calls[0][0].where.uuid.in).toHaveLength(500);
    expect(tx.beneficiaryRedeem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.beneficiaryRedeem.createMany.mock.calls[0][0].data).toHaveLength(500);
    expect(prisma.$transaction.mock.calls[0][1]).toMatchObject({ timeout: expect.any(Number) });
    expect(chain.queueReturnTokens).toHaveBeenCalledTimes(1); // chunking happens in queueReturnTokens
  });

  it('does not block or throw when enqueue fails, records FAILED on payout', async () => {
    prisma.beneficiaryGroupTokens.findMany.mockResolvedValue([
      { numberOfTokens: 30, payout: openPayout() },
    ]);
    chain.queueReturnTokens.mockRejectedValue(new Error('redis down'));

    await expect(service.skipOldPayoutForRemaining(GROUP)).resolves.toBeUndefined();

    expect(chain.setTokenReturnState).toHaveBeenCalledWith(
      'payout-1',
      expect.objectContaining({ status: 'FAILED' })
    );
  });

  it('is a no-op when the payout is already completed or skipped', async () => {
    prisma.beneficiaryGroupTokens.findMany.mockResolvedValue([
      { numberOfTokens: 30, payout: { ...openPayout(), status: 'COMPLETED' } },
      { numberOfTokens: 30, payout: openPayout({ skippedAt: 'x' }) },
      { numberOfTokens: 30, payout: null },
    ]);

    await service.skipOldPayoutForRemaining(GROUP);

    expect(chain.queueReturnTokens).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects on non-stellar chain', async () => {
    settings.getPublic.mockResolvedValue({ value: { type: 'evm' } });

    await expect(service.skipOldPayoutForRemaining(GROUP)).rejects.toMatchObject({
      error: { code: 'SKIP_OLD_PAYOUT_STELLAR_ONLY' },
    });
  });

  it('checkIsTokenAlreadyAssigned does not block on a skipped payout', async () => {
    prisma.beneficiaryGroups.findMany.mockResolvedValue([
      {
        tokensReserved: [
          {
            isDisbursed: true,
            payoutId: 'payout-1',
            payout: { uuid: 'payout-1', status: 'FAILED', extras: { skippedAt: 'x' } },
          },
        ],
      },
    ]);

    const res = await service.checkIsTokenAlreadyAssigned('group-1');

    expect(res.isAssignable).toBe(true);
  });
});
