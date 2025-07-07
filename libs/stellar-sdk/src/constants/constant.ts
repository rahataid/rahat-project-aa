export const sdpAuth = {
  USERNAME: 'SDP-admin',
  API_KEY: 'api_key_1234567890',
};

export type WALLETS = 'Demo Wallet' | 'Vibrant Wallet';
export type DisbursementStatus = 'DRAFT' | 'STARTED' | 'PAUSED' | 'READY';
export type VERIFICATION = 'PIN' | 'DOB';

export type DisbursementType = {
  VERIFICATION: VERIFICATION;
  WalletType: WALLETS;
  STATUS: DisbursementStatus;
};

export const DISBURSEMENT: DisbursementType = {
  VERIFICATION: 'PIN',
  WalletType: 'Demo Wallet',
  STATUS: 'STARTED',
};

export const countryCode = 'ASM';

export const smsRegistrationMessageTemplate = '';
