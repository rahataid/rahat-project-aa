import { EvmChainService } from './evm-chain.service';

describe('EvmChainService.getBeneficiaryPayoutTypeByPhone', () => {
  const findMany = jest.fn();
  const send = jest.fn();
  let service: any;

  const groupsOf = (...ids: string[]) => ({
    groupedBeneficiaries: ids.map((id) => ({
      beneficiaryGroupId: id,
      groupPurpose: 'GENERAL',
    })),
  });
  const token = (uuid: string, status: string, extras: any = null) => ({
    uuid,
    isDisbursed: true,
    payout: { uuid: `payout-${uuid}`, status, extras },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new (EvmChainService as any)(
      {}, {}, {},
      { send },
      { beneficiaryGroups: { findMany } },
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
      { uuid: 'old', tokensReserved: [token('t1', 'COMPLETED')] },
      { uuid: 'new', tokensReserved: [token('t2', 'PENDING')] },
    ]);
    const payout = await run(groupsOf('old', 'new'));
    expect(payout.uuid).toBe('payout-t2');
  });

  it('picks the newer cycle inside one group when the older payout is completed', async () => {
    findMany.mockResolvedValue([
      { uuid: 'g', tokensReserved: [token('t1', 'COMPLETED'), token('t2', 'PENDING')] },
    ]);
    const payout = await run(groupsOf('g'));
    expect(payout.uuid).toBe('payout-t2');
  });

  it('still rejects when active payouts exist in more than one group', async () => {
    findMany.mockResolvedValue([
      { uuid: 'a', tokensReserved: [token('t1', 'PENDING')] },
      { uuid: 'b', tokensReserved: [token('t2', 'PENDING')] },
    ]);
    await expect(run(groupsOf('a', 'b'))).rejects.toMatchObject({
      error: { params: { message: expect.stringContaining('Multiple payout-eligible groups') } },
    });
  });

  it('rejects when there is no active payout', async () => {
    findMany.mockResolvedValue([
      { uuid: 'g', tokensReserved: [token('t1', 'COMPLETED')] },
    ]);
    await expect(run(groupsOf('g'))).rejects.toMatchObject({
      error: { params: { message: expect.stringContaining('Tokens not reserved') } },
    });
  });
});
