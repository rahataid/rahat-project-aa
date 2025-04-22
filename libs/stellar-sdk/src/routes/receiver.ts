export const RECEIVER = {
    AUTH: '/auth',
    SIGN: '/sign',
    HOME_DOMAIN: (tenantName: string) => `${tenantName}.tenant.stellar.rahat.io`,
    CLIENT_DOMAIN: 'demo-wallet-server.stellar.org',
    INTERACTIVE: '/sep24/transactions/deposit/interactive',
    SEND_OTP: '/wallet-registration/otp',
    VERIFY_OTP: '/wallet-registration/verification'
}