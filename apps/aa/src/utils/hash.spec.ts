import bcrypt from 'bcryptjs';
import { getOtpHash, verifyOtpHash } from './hash';

describe('verifyOtpHash', () => {
  it('accepts an OTP hashed with sha256', async () => {
    expect(await verifyOtpHash(getOtpHash('1234'), '1234')).toBe(true);
  });

  it('accepts an OTP hashed with the legacy bcrypt', async () => {
    const legacy = bcrypt.hashSync('1234', 4);
    expect(await verifyOtpHash(legacy, '1234')).toBe(true);
  });

  it('does not accept an amount appended to the OTP', async () => {
    expect(await verifyOtpHash(getOtpHash('1234'), '1234:100')).toBe(false);
  });

  it('rejects a wrong OTP for both algorithms', async () => {
    expect(await verifyOtpHash(getOtpHash('1234'), '9999')).toBe(false);
    expect(await verifyOtpHash(bcrypt.hashSync('1234', 4), '9999')).toBe(false);
  });

  it('only falls back to bcrypt for bcrypt-shaped hashes', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    expect(await verifyOtpHash(getOtpHash('1234'), '9999')).toBe(false);
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();
  });

  it('returns false for an empty or malformed hash instead of throwing', async () => {
    expect(await verifyOtpHash('', '1234')).toBe(false);
    expect(await verifyOtpHash('$2a$10$not-a-real-hash', '1234')).toBe(false);
  });
});
