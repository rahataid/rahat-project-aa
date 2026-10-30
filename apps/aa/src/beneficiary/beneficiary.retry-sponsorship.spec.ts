import { Logger } from '@nestjs/common';
import { BeneficiaryService } from './beneficiary.service';
import { EVENTS } from '../constants';

// Exercises retrySponsorshipForGroup on its own; the full BeneficiaryService spec setup is heavy.
describe('BeneficiaryService.retrySponsorshipForGroup funds check', () => {
  const groupUuid = 'group-1';
  let service: BeneficiaryService;
  let assertSponsorFundsForGroup: jest.Mock;
  let emit: jest.Mock;

  beforeEach(() => {
    assertSponsorFundsForGroup = jest.fn().mockResolvedValue(undefined);
    emit = jest.fn();
    service = Object.assign(Object.create(BeneficiaryService.prototype), {
      logger: new Logger('test'),
      eventEmitter: { emit },
      moduleRef: { get: () => ({ assertSponsorFundsForGroup }) },
      prisma: {
        beneficiaryToGroup: {
          findMany: jest.fn().mockResolvedValue([{ beneficiary: { uuid: 'ben-1', walletAddress: 'GABC' } }]),
        },
      },
      getSponsorshipStatusForGroup: jest
        .fn()
        .mockResolvedValue({ isStellarChain: true, pending: 1, failed: 0, noWallet: 0 }),
    });
  });

  it('rejects before queuing when the sponsor cannot cover the group', async () => {
    assertSponsorFundsForGroup.mockRejectedValue(new Error('[INSUFFICIENT_SPONSOR_FUNDS]'));

    await expect(service.retrySponsorshipForGroup({ groupUuid })).rejects.toThrow('INSUFFICIENT_SPONSOR_FUNDS');
    expect(assertSponsorFundsForGroup).toHaveBeenCalledWith([{ uuid: 'ben-1', walletAddress: 'GABC' }]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('queues when funds are sufficient', async () => {
    await expect(service.retrySponsorshipForGroup({ groupUuid })).resolves.toMatchObject({ queued: true });
    expect(emit).toHaveBeenCalledWith(EVENTS.BENEFICIARY_GROUP_ADDED_TO_PROJECT, { groupUuid });
  });

  it('skips the check for the post-sync retry', async () => {
    await service.retrySponsorshipForGroup({ groupUuid }, { checkFunds: false });
    expect(assertSponsorFundsForGroup).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
  });
});
