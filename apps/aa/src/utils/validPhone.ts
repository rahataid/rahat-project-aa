import { isValidPhoneNumber } from 'libphonenumber-js';

export const isValidPhone = (phone: string): boolean => {
  if (!phone || phone.trim() === '') return false;

  try {
    const normalizedPhone = /^\d{10}$/.test(phone.trim())
      ? `+977${phone.trim()}`
      : phone.trim();

    return isValidPhoneNumber(normalizedPhone);
  } catch {
    return false;
  }
};
