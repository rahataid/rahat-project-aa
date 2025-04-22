export const DISBURSEMENT = {
    WALLET: '/wallets',
    ASSET: '/assets',
    DISBURSEMENT: '/disbursements',
    UPDATE: (disbursementId:string) => `/disbursements/${disbursementId}/status`,
    UPLOAD: (disbursementId:string) => `/disbursements/${disbursementId}/instructions`
}