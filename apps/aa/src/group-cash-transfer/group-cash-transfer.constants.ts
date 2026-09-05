// Known CIPS bank validation response messages, translated to Nepali.
// Falls back to the original (English) message for anything not listed here.
export const CIPS_MESSAGE_NP: Record<string, string> = {
  'Beneficiary account name mismatch': 'लाभग्राहीको खाता नाम मिलेन।',
  'Bank account validation failed': 'बैंक खाता प्रमाणीकरण असफल भयो।',
  'Account not found': 'खाता फेला परेन।',
  'Invalid account': 'अमान्य खाता।',
};

export function translateCipsMessage(message: string): string {
  return CIPS_MESSAGE_NP[message] ?? message;
}
