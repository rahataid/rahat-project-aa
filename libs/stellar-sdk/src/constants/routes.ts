export const AUTH = {
  LOGIN: '/login',
};

export const DISBURSEMENT = {
  WALLET: '/wallets',
  ASSET: '/assets',
  DISBURSEMENT: '/disbursements',
  UPDATE: (disbursementId: string) => `/disbursements/${disbursementId}/status`,
  GET: (disbursementId: string) => `/disbursements/${disbursementId}`,
  UPLOAD: (disbursementId: string) =>
    `/disbursements/${disbursementId}/instructions`,
};

export const RECEIVER = {
  AUTH: '/auth',
  SIGN: '/sign',
  HOME_DOMAIN: (tenantName: string) => `${tenantName}.tenant.stellar.rahat.io`,
  CLIENT_DOMAIN: 'demo-wallet-server.stellar.org',
  INTERACTIVE: '/sep24/transactions/deposit/interactive',
  SEND_OTP: '/wallet-registration/otp',
  VERIFY_OTP: '/wallet-registration/verification',
};

export const STELLAR = {
  ASSET: '/assets',
  TENANATS: '/tenants',
  ORGANIZATION: '/organization',
};

export const TENANATS = {
  CREATE: '/tenants',
  URLS: (tenantName: string) => {
    return {
      base_url: `http://${tenantName}.stellar.local:8000`,
      sdp_ui_base_url: `http://${tenantName}.stellar.local:3000`,
    };
  },
  OWNER_EMAIL: (tenantName: string) => `init_owner@${tenantName}.local`,
  owner_first_name: 'Sushant',
  owner_last_name: 'Tripathee',
  distribution_account_type: 'DISTRIBUTION_ACCOUNT.STELLAR.DB_VAULT',
};
