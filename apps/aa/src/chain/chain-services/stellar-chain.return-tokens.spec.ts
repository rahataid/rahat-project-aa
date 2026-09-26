import { SdpClient } from '@rahataid/stellar-sdp';
import { StellarChainService } from './stellar-chain.service';

jest.mock('@rahataid/stellar-sdp', () => ({ SdpClient: jest.fn() }));

describe('StellarChainService token return (chunked)', () => {
  const prisma: any = {
    payouts: { findUnique: jest.fn(), update: jest.fn() },
    beneficiaryRedeem: { findMany: jest.fn(), update: jest.fn() },
  };
  const queue = { addBulk: jest.fn() };
  let service: any;
  let tokenReturn: any; // simulated payout.extras.tokenReturn

  beforeEach(() => {
    jest.clearAllMocks();
    tokenReturn = undefined;
    prisma.payouts.findUnique.mockImplementation(async () => ({
      uuid: 'p1',
      extras: { skippedAt: 'x', ...(tokenReturn ? { tokenReturn } : {}) },
    }));
    prisma.payouts.update.mockImplementation(async ({ data }: any) => {
      tokenReturn = data.extras.tokenReturn;
    });
    prisma.beneficiaryRedeem.findMany.mockResolvedValue([]);
    service = new (StellarChainService as any)({}, {}, queue, {}, prisma, {}, {}, {}, {});
  });

  const rowsFor = (...wallets: string[]) =>
    wallets.map((w) => ({ uuid: `r-${w}`, beneficiaryWalletAddress: w, info: null }));

  it('splits 1000 wallets into small deterministic jobs, never one big job', async () => {
    const wallets = Array.from({ length: 1000 }, (_, i) => `W${i}`);

    await service.queueReturnTokens({ payoutUuid: 'p1', wallets, amountPerWallet: 10 });

    const jobs = queue.addBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(42); // ceil(1000 / 24)
    expect(Math.max(...jobs.map((j: any) => j.data.wallets.length))).toBeLessThanOrEqual(24);
    expect(jobs.flatMap((j: any) => j.data.wallets)).toEqual(wallets);
    expect(jobs[0].opts.jobId).toBe('return-tokens-p1-0');
    expect(jobs[41].data).toMatchObject({ chunkIndex: 41, totalChunks: 42, amountPerWallet: 10 });
    expect(tokenReturn).toMatchObject({ status: 'QUEUED', totalWallets: 1000, totalChunks: 42 });
  });

  it('skips wallets already returned, caps amount and records the tx on the redeem row', async () => {
    prisma.beneficiaryRedeem.findMany.mockResolvedValue([
      { ...rowsFor('W1')[0], info: { tokenReturn: { txHash: 'H0' } } },
      ...rowsFor('W2'),
    ]);
    const spy = jest
      .spyOn(service, 'returnTokensToDistributionWallet')
      .mockResolvedValue([{ walletAddress: 'W2', amount: '10.0000000', txHash: 'H1' }]);

    await service.processReturnTokens(
      { payoutUuid: 'p1', wallets: ['W1', 'W2'], amountPerWallet: 10, chunkIndex: 0, totalChunks: 1 },
      true
    );

    expect(spy).toHaveBeenCalledWith(['W2'], 10);
    expect(prisma.beneficiaryRedeem.update).toHaveBeenCalledTimes(1);
    expect(prisma.beneficiaryRedeem.update.mock.calls[0][0]).toMatchObject({
      where: { uuid: 'r-W2' },
      data: { info: { tokenReturn: { txHash: 'H1' } } },
    });
    expect(tokenReturn).toMatchObject({ status: 'COMPLETED', completedChunks: [0], failedChunks: [] });
  });

  it('is PROCESSING until every chunk has reported', async () => {
    jest.spyOn(service, 'returnTokensToDistributionWallet').mockResolvedValue([]);

    await service.processReturnTokens(
      { payoutUuid: 'p1', wallets: ['W1'], chunkIndex: 0, totalChunks: 2 },
      true
    );
    expect(tokenReturn).toMatchObject({ status: 'PROCESSING', completedChunks: [0] });

    await service.processReturnTokens(
      { payoutUuid: 'p1', wallets: ['W2'], chunkIndex: 1, totalChunks: 2 },
      true
    );
    expect(tokenReturn).toMatchObject({ status: 'COMPLETED', completedChunks: [0, 1] });
  });

  it('keeps partial progress and throws to trigger a retry without marking the chunk done', async () => {
    prisma.beneficiaryRedeem.findMany.mockResolvedValue(rowsFor('W1', 'W2'));
    jest.spyOn(service, 'returnTokensToDistributionWallet').mockResolvedValue([
      { walletAddress: 'W1', amount: '10', txHash: 'H1' },
      { walletAddress: 'W2', amount: '10', error: 'tx_bad_seq' },
    ]);

    await expect(
      service.processReturnTokens(
        { payoutUuid: 'p1', wallets: ['W1', 'W2'], chunkIndex: 0, totalChunks: 1 },
        false
      )
    ).rejects.toThrow('tx_bad_seq');

    expect(prisma.beneficiaryRedeem.update).toHaveBeenCalledTimes(1); // W1 only
    expect(tokenReturn).toMatchObject({ status: 'PROCESSING', completedChunks: [], failedChunks: [] });
    expect(tokenReturn.error).toContain('tx_bad_seq');
  });

  it('marks the chunk failed on the last attempt and the payout FAILED when all chunks reported', async () => {
    jest.spyOn(service, 'returnTokensToDistributionWallet').mockRejectedValue(new Error('no secret'));

    await expect(
      service.processReturnTokens(
        { payoutUuid: 'p1', wallets: ['W1'], chunkIndex: 0, totalChunks: 1 },
        true
      )
    ).rejects.toThrow('no secret');

    expect(tokenReturn).toMatchObject({ status: 'FAILED', failedChunks: [0], error: 'no secret' });
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

describe('StellarChainService.getSdpDistributionAccount', () => {
  const G = 'GBUNM66NFAKFKIVNVXPOU57PBCYJPDDTQ6UUC74SXKMEFC4O6TZTWBHS';
  const orgGet = jest.fn();
  const balancesGet = jest.fn();
  let service: any;

  beforeEach(() => {
    jest.clearAllMocks();
    (SdpClient as unknown as jest.Mock).mockImplementation(() => ({
      organization: { get: orgGet },
      balances: { get: balancesGet },
    }));
    service = new (StellarChainService as any)({}, {}, {}, {}, {}, {}, {}, {}, {});
    service.getFromSettings = jest.fn().mockResolvedValue({
      sdpUrl: 'https://sdp',
      tenantName: 't',
      apiKey: 'k',
    });
  });

  it('reads distribution_account.address from /organization and never calls /balances', async () => {
    orgGet.mockResolvedValue({
      distribution_account: { address: G, type: 'DISTRIBUTION_ACCOUNT.STELLAR.ENV' },
      distribution_account_public_key: 'ignored',
    });

    await expect(service.getSdpDistributionAccount()).resolves.toBe(G);
    expect(balancesGet).not.toHaveBeenCalled();
  });

  it('falls back to distribution_account_public_key', async () => {
    orgGet.mockResolvedValue({ distribution_account_public_key: G });

    await expect(service.getSdpDistributionAccount()).resolves.toBe(G);
  });

  it('rejects a missing or malformed address instead of using it as a destination', async () => {
    orgGet.mockResolvedValue({ distribution_account: { address: { nope: 1 } } });
    await expect(service.getSdpDistributionAccount()).rejects.toMatchObject({
      error: { code: 'SDP_DISTRIBUTION_ACCOUNT_NOT_FOUND' },
    });

    orgGet.mockResolvedValue({});
    await expect(service.getSdpDistributionAccount()).rejects.toMatchObject({
      error: { code: 'SDP_DISTRIBUTION_ACCOUNT_NOT_FOUND' },
    });
  });
});
