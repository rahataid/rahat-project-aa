import { SponsorAccountInfo } from '../types';

export const STROOPS_PER_XLM = 10_000_000;

const BASE_RESERVE_STROOPS = 0.5 * STROOPS_PER_XLM;

/**
 * XLM the sponsor must have free per beneficiary it is about to sponsor. A sponsored
 * account locks 1.5 XLM (account entry = 2 reserve units, trustline = 1) and this
 * leaves 0.1 XLM of headroom on top.
 */
export const MIN_FREE_XLM_PER_BENEFICIARY = 1.6;

/** Stroops of the sponsor's balance that no new sponsorship may use. */
export function sponsorLockedStroops(info: SponsorAccountInfo): number {
  // Stellar's minimum balance already counts every entry the sponsor pays for
  // (numSponsoring), so funds reserved by earlier beneficiaries are never "free".
  const minBalance =
    (2 + info.subentryCount + info.numSponsoring - info.numSponsored) * BASE_RESERVE_STROOPS;
  return minBalance + info.sellingLiabilitiesStroops;
}

export function sponsorFreeStroops(info: SponsorAccountInfo): number {
  return Math.max(0, info.balanceStroops - sponsorLockedStroops(info));
}

export function sponsorRequiredStroops(beneficiaries: number): number {
  return Math.round(beneficiaries * MIN_FREE_XLM_PER_BENEFICIARY * STROOPS_PER_XLM);
}

/** Horizon returns amounts as 7-decimal strings, e.g. "100.0000000". */
export function xlmToStroops(amount: string | undefined): number {
  if (!amount) return 0;
  const [whole, fraction = ''] = amount.split('.');
  return Number(whole) * STROOPS_PER_XLM + Number(fraction.padEnd(7, '0').slice(0, 7));
}
