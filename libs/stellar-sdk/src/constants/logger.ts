export const LOGS = {
    INFO: {
        TENANT_CREATING: 'Creating tenant....',
        LOGIN: 'Login successful, token received.',
        TRUSTLINE: 'Adding trustline to distribution account',
        DISBURSEMENT_ADDRESS: (name:any) => `Fetching distribution address for tenant: ${name}`,
        TRANSFER_ASSET: (assetCode: string, destination_address: string) => `Transferring asset ${assetCode} to ${destination_address}`,
        DISBURSEMENT_CREATE: (disbursementName: string) => `Creating disbursement: ${disbursementName}`,
        UPDATE_STATUS: (status: string) => `Updating Disbursement Status to: ${status}`
    },
    WARN: {
        TENANT_SUCCESS: 'Successfully created tenant',
        LOGIN: 'No token found, attempting to login...',
        TRUSTLINE: 'Added trustline to distribution account',
        TRANSFER_ASSET: "Asset transfer successful",
        DISBURSEMENT_SUCCESS: "Successfully created disbursement",
        DISBURSEMENT_UPLOAD: "Updated disbursement with disbursement CSV successfully.",
        UPDATE_STATUS: (disbursementId: string, status: string) => `Updated disbursement ${disbursementId} to ${status} successfully`
    },
    ERROR: {
        DISBURSEMENT_CREATE: (error: any) => `Error creating disbursement: ${error}`,
        LOGIN: (error: any) => `Login failed: ${error}`,
        DISBURSEMENT_ADDRESS: (error: any) => `Error fetching distribution address: ${error}`,
        DISBURSEMENT_ADDDRESS_NOT_FOUND: (name:any) => `No tenant found with name: ${name}`
    }
}