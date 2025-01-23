export type WALLETS = 'Demo Wallet' | 'Vibrant Wallet'
export type DISBURSEMENT_STATUS = 'DRAFT' | 'STARTED' | 'PAUSED' | 'READY'
export type VERIFICATION = "PIN" | "DOB";

export type DISBURSEMENT_TYPE = {
    VERIFICATION: VERIFICATION,
    WALLET_TYPE: WALLETS,
    STATUS: DISBURSEMENT_STATUS
}

export const DISBURSEMENT: DISBURSEMENT_TYPE = {
    VERIFICATION: "PIN",
    WALLET_TYPE: "Demo Wallet",
    STATUS: "STARTED"
}

export const country_code = 'ASM'

export const sms_registration_message_template = ''