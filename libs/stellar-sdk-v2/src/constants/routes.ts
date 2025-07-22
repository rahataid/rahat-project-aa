export const API_ROUTES = {
  AUTH: {
    LOGIN: '/login',
  },
  DISBURSEMENT: {
    WALLET: '/wallets',
    ASSET: '/assets',
    DISBURSEMENT: '/disbursements',
    UPDATE: (disbursementId: string) =>
      `/disbursements/${disbursementId}/status`,
    GET: (disbursementId: string) => `/disbursements/${disbursementId}`,
    UPLOAD: (disbursementId: string) =>
      `/disbursements/${disbursementId}/instructions`,
  },
  STELLAR: {
    ASSET: '/assets',
    TENANTS: '/tenants',
    ORGANIZATION: '/organization',
    TRANSACTIONS: '/transactions',
    ACCOUNTS: '/accounts',
    TRANSFER: '/transfer',
    BATCH_FUND: '/batch-fund',
    TRUSTLINE: '/trustline',
    SEND: '/send',
  },
} as const;
