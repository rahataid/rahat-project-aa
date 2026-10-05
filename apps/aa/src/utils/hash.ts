import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';

export function getOtpHash(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

// bcrypt hashes look like "$2a$10$..."; a sha256 hex digest can never match this.
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

/**
 * Checks the OTP against the sha256 hash first. OTPs created before the switch to sha256 were
 * hashed with bcrypt, so a miss falls back to bcrypt.compare before reporting a mismatch.
 */
export async function verifyOtpHash(hash: string, otp: string): Promise<boolean> {
  if (!hash) return false;
  if (getOtpHash(otp) === hash) return true;
  if (!BCRYPT_HASH.test(hash)) return false;

  try {
    return await bcrypt.compare(otp, hash);
  } catch {
    return false;
  }
}
