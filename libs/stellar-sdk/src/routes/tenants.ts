export const TENANATS = {
    CREATE: '/tenants',
    URLS: (tenantName: string) => {
        return {
            base_url: `http://${tenantName}.stellar.local:8000`,
            sdp_ui_base_url: `http://${tenantName}.stellar.local:3000`
        }
        
    },
    OWNER_EMAIL: (tenantName: string) => `init_owner@${tenantName}.local`,
    owner_first_name: 'Sushant',
    owner_last_name: 'Tripathee',
    distribution_account_type: 'DISTRIBUTION_ACCOUNT.STELLAR.DB_VAULT'
}