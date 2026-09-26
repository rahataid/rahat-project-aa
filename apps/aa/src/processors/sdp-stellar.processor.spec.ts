import { SdpStellarProcessor } from './sdp-stellar.processor';

describe('SdpStellarProcessor.handleStatusUpdate', () => {
  const queue = { add: jest.fn() };
  const beneficiaryService = {
    getOneTokenReservationByGroupId: jest.fn(),
    updateGroupToken: jest.fn(),
  };
  const emitter = { emit: jest.fn() };
  const get = jest.fn();
  let service: any;

  const job = (data: any = {}) =>
    ({
      id: 'j1',
      data: { disbursementId: 'd1', groupUuid: 'g1', startedAt: Date.now(), ...data },
    } as any);
  const token = (over: any = {}) => ({
    uuid: 't1',
    isDisbursed: false,
    info: { disbursement: { id: 'd1' }, disbursementStartedAt: '2026-01-01T00:00:00.000Z' },
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new (SdpStellarProcessor as any)(queue, beneficiaryService, {}, {}, emitter);
    service.sdpClient = { disbursements: { get } };
    beneficiaryService.getOneTokenReservationByGroupId.mockResolvedValue(token());
  });

  it('marks the token DISBURSED on COMPLETED, keeps existing info and emits the event', async () => {
    get.mockResolvedValue({ id: 'd1', status: 'COMPLETED' });

    await service.handleStatusUpdate(job());

    const arg = beneficiaryService.updateGroupToken.mock.calls[0][0];
    expect(arg).toMatchObject({ status: 'DISBURSED', isDisbursed: true });
    expect(arg.info.disbursementStartedAt).toBe('2026-01-01T00:00:00.000Z'); // not dropped
    expect(arg.info.disbursementTimeTaken).toBeGreaterThan(0);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op (no throw, no SDP call) when the token is already DISBURSED', async () => {
    beneficiaryService.getOneTokenReservationByGroupId.mockResolvedValue(
      token({ isDisbursed: true })
    );

    await expect(service.handleStatusUpdate(job())).resolves.toBeUndefined();

    expect(get).not.toHaveBeenCalled();
    expect(beneficiaryService.updateGroupToken).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('drops a stale check from an older disbursement so it cannot touch a newer token', async () => {
    beneficiaryService.getOneTokenReservationByGroupId.mockResolvedValue(
      token({ info: { disbursement: { id: 'NEW' } } })
    );

    await service.handleStatusUpdate(job({ disbursementId: 'OLD' }));

    expect(get).not.toHaveBeenCalled();
    expect(beneficiaryService.updateGroupToken).not.toHaveBeenCalled();
  });

  it('re-queues with an escalating delay while SDP is still processing', async () => {
    get.mockResolvedValue({ id: 'd1', status: 'STARTED' });

    await service.handleStatusUpdate(job({ poll: 0 }));
    await service.handleStatusUpdate(job({ poll: 3 }));

    expect(queue.add.mock.calls[0][2].delay).toBe(30_000);
    expect(queue.add.mock.calls[0][1].poll).toBe(1);
    expect(queue.add.mock.calls[1][2].delay).toBe(180_000); // capped at 3 minutes
    expect(beneficiaryService.updateGroupToken).not.toHaveBeenCalled();
  });

  it('marks the token FAILED when SDP reports failure', async () => {
    get.mockResolvedValue({ id: 'd1', status: 'FAILED' });

    await service.handleStatusUpdate(job());

    expect(beneficiaryService.updateGroupToken.mock.calls[0][0]).toMatchObject({
      status: 'FAILED',
      isDisbursed: false,
    });
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
