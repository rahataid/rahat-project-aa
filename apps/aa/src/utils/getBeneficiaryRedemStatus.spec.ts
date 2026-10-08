import { calculatePayoutStatus } from './getBeneficiaryRedemStatus';

const payout = (statuses: string[]) =>
  ({
    type: 'VENDOR',
    beneficiaryRedeem: statuses.map((status) => ({ status })),
    beneficiaryGroupToken: {
      beneficiaryGroup: { _count: { beneficiaries: statuses.length } },
    },
  } as any);

describe('calculatePayoutStatus', () => {
  it('FAILED only when nothing paid out', () => {
    expect(calculatePayoutStatus(payout(['FAILED', 'FAILED']))).toBe('FAILED');
    expect(
      calculatePayoutStatus(payout(['TOKEN_TRANSACTION_COMPLETED', 'FIAT_TRANSACTION_FAILED']))
    ).toBe('FAILED');
  });

  it('PARTIALLY_COMPLETED when some paid and some failed', () => {
    expect(calculatePayoutStatus(payout(['COMPLETED', 'FAILED']))).toBe('PARTIALLY_COMPLETED');
    expect(
      calculatePayoutStatus(payout(['FIAT_TRANSACTION_COMPLETED', 'FIAT_TRANSACTION_FAILED']))
    ).toBe('PARTIALLY_COMPLETED');
  });

  it('CANCELLED redeems (skipped payout) still render the payout as failed/partial', () => {
    expect(calculatePayoutStatus(payout(['CANCELLED', 'CANCELLED']))).toBe('FAILED');
    expect(calculatePayoutStatus(payout(['COMPLETED', 'CANCELLED']))).toBe('PARTIALLY_COMPLETED');
  });
});
