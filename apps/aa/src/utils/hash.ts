import { createHash } from "crypto"

export function getOtpHash(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function verifyOtpHash(hash: string, otp: string): boolean {
  const userWrittenOtpHash = createHash('sha256').update(otp).digest('hex');

  return userWrittenOtpHash === hash;
}
