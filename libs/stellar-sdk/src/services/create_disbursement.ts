import { ASSET } from "../constants/asset";
import { DISBURSEMENT, WALLETS } from "../constants/disbursement";
import { LOGS } from "../constants/logger";
import { logger } from "../logger";
import { create_asset } from "../scripts/assets/create";
import { transfer_asset } from "../scripts/assets/transfer_asset";
import { AuthService } from "../scripts/auth/login";
import { createDisbursement } from "../scripts/disbursement/create";
import { updateDisbursementStatus } from "../scripts/disbursement/update_status";
import { uploadDisbursementFile } from "../scripts/disbursement/upload";
import { add_disbursement_trustline } from "../scripts/stellar/add_distribution_trustline";
import { get_distribution_address } from "../utils/get_distribution_address";

export let token : string;
export class DisbursementServices {
    private walletType: WALLETS;

    constructor(private email: string, private password: string, private tenantName: string, private disbursementName: string, private file: File) {
        this.walletType = DISBURSEMENT.WALLET_TYPE;
    }

    public async createDisbursementProcess(): Promise<any> {
        try {
            await this.authenticate();
            await this.custom_asset();
            return this.disbursement(this.file);
        } catch (error) {
            logger.error(LOGS.ERROR.DISBURSEMENT_CREATE(error));
            throw error;
        }
    }

    // Authenticates user
    private async authenticate(): Promise<void> {
        const authService = new AuthService(this.tenantName, this.email, this.password)
        token = await authService.getToken() as string;
    }

    // Creates custom asset and fund disbursement account
    private async custom_asset() {
        try {
        const asset = await create_asset(ASSET.NAME);
        await add_disbursement_trustline(ASSET.NAME, asset.issuer);
        const disbursementAddress = await get_distribution_address(this.tenantName)
        await transfer_asset(disbursementAddress, asset);
        } catch (error) {
            throw error;
        }
        
    }

    // Create disbursement and update status
    private async disbursement(file: File) {
        try {
            const disbursement = await createDisbursement({
                walletType: this.walletType,
                verification: DISBURSEMENT.VERIFICATION,
                assetCodes: ASSET.NAME,
                disbursement_name: this.disbursementName,
            });
    
            const disbursementID = disbursement?.disbursementID;
    
            await uploadDisbursementFile(disbursementID, file);
            await updateDisbursementStatus(DISBURSEMENT.STATUS, disbursementID);
    
            return disbursement;
        } catch (error) {
            throw error;
        }
        
    }
}
