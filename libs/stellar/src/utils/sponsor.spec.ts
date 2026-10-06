import { SponsorAccountInfo } from '../types';
import {
  sponsorFreeStroops,
  sponsorRequiredStroops,
  STROOPS_PER_XLM,
  xlmToStroops,
} from './sponsor';

const xlm = (n: number) => n * STROOPS_PER_XLM;

const sponsor = (overrides: Partial<SponsorAccountInfo> = {}): SponsorAccountInfo => ({
  publicKey: 'GSPONSOR',
  balanceStroops: xlm(100),
  sellingLiabilitiesStroops: 0,
  subentryCount: 0,
  numSponsoring: 0,
  numSponsored: 0,
  ...overrides,
});

describe('sponsor funds', () => {
  it('parses Horizon amounts without float drift', () => {
    expect(xlmToStroops('100.0000000')).toBe(xlm(100));
    expect(xlmToStroops('0.1000001')).toBe(1_000_001);
    expect(xlmToStroops(undefined)).toBe(0);
  });

  it('keeps the account base reserve out of the free funds', () => {
    expect(sponsorFreeStroops(sponsor())).toBe(xlm(99));
  });

  it('keeps funds reserved for already sponsored beneficiaries out of the free funds', () => {
    // 3 sponsored beneficiaries = 9 reserve units = 4.5 XLM locked
    expect(sponsorFreeStroops(sponsor({ numSponsoring: 9 }))).toBe(xlm(99 - 4.5));
  });

  it('needs 1.6 XLM per new beneficiary', () => {
    expect(sponsorRequiredStroops(2)).toBe(xlm(3.2));
  });

  it('fails when 2 new beneficiaries do not fit next to 3 sponsored ones', () => {
    // balance 8.6: 1 base + 4.5 locked leaves 3.1 free, 2 beneficiaries need 3.2
    const info = sponsor({ balanceStroops: xlm(8.6), numSponsoring: 9 });
    expect(sponsorFreeStroops(info)).toBe(xlm(3.1));
    expect(sponsorFreeStroops(info) < sponsorRequiredStroops(2)).toBe(true);
    // 0.1 XLM more is enough
    expect(sponsorFreeStroops({ ...info, balanceStroops: xlm(8.7) }) >= sponsorRequiredStroops(2)).toBe(true);
  });
});
