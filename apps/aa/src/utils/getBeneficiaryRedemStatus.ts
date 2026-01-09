import { Payouts } from '@prisma/client';

export type RedeemStatus = 'FAILED' | 'COMPLETED' | 'NOT_STARTED' | 'PENDING';

export type PayoutWithRelations = Payouts & {
  beneficiaryGroupToken?: {
    uuid: string;
    status: string;
    numberOfTokens: number;
    isDisbursed: boolean;
    createdBy: string;
    beneficiaryGroup?: {
      _count?: {
        beneficiaries: number;
      };
    };
  };
  beneficiaryRedeem: { status: string }[];
};

export function calculatePayoutStatus(
  payout: PayoutWithRelations
): RedeemStatus {
  const FAILED_STATUSES = [
    'FAILED',
    'FIAT_TRANSACTION_FAILED',
    'TOKEN_TRANSACTION_FAILED',
  ];
  const COMPLETED_STATUSES = [
    'COMPLETED',
    'FIAT_TRANSACTION_COMPLETED',
    'TOKEN_TRANSACTION_COMPLETED',
  ];
  const PENDING_STATUSES = [
    'PENDING',
    'FIAT_TRANSACTION_INITIATED',
    'TOKEN_TRANSACTION_INITIATED',
  ];

  const redeemStatuses = payout.beneficiaryRedeem.map((r) => r.status);
  const redeemCount = redeemStatuses.length;

  const beneficiariesCount =
    payout.beneficiaryGroupToken?.beneficiaryGroup?._count?.beneficiaries || 0;
  const expectedCount =
    payout.type === 'FSP' && payout.payoutProcessorId !== 'manual-bank-transfer' ? beneficiariesCount * 2 : beneficiariesCount;

  if (redeemCount === 0) return 'NOT_STARTED';
  if (redeemStatuses.some((s) => FAILED_STATUSES.includes(s))) return 'FAILED';

  if (redeemCount === expectedCount) {
    if (redeemStatuses.every((s) => COMPLETED_STATUSES.includes(s)))
      return 'COMPLETED';
    if (redeemStatuses.some((s) => PENDING_STATUSES.includes(s)))
      return 'PENDING';
    return 'NOT_STARTED';
  }

  return 'PENDING';
}
