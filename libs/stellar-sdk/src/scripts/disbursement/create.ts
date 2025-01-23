import { country_code, sms_registration_message_template } from "../../constants/disbursement";
import { LOGS } from "../../constants/logger";
import { logger } from "../../logger";
import { DISBURSEMENT } from "../../routes/disbursement";
import { axiosInstance } from "../../utils/axiosInstance"

type DisbursementProp = {
    walletType: 'Demo Wallet' | 'Vibrant Wallet',
    verification: 'PIN' | 'DOB',
    assetCodes: string,
    disbursement_name: string
}

export const createDisbursement = async ({walletType, verification, assetCodes, disbursement_name}: DisbursementProp) => {

    const walletRes = await axiosInstance.get(DISBURSEMENT.WALLET)

    const {id: wallet_id} = walletRes.data.find((wallet: any) => wallet.name === walletType);

    const asset_res = await axiosInstance.get(DISBURSEMENT.ASSET)
    const {id: asset_id} = asset_res.data.find((asset: any) => asset.code === assetCodes);

    logger.info(LOGS.INFO.DISBURSEMENT_CREATE(disbursement_name))

    const res: any = await axiosInstance.post(DISBURSEMENT.DISBURSEMENT, 
        {
        name: disbursement_name,
        wallet_id,
        asset_id,
        country_code,
        verification_field: verification,
        sms_registration_message_template
    }
    )

    logger.warn(LOGS.WARN.DISBURSEMENT_SUCCESS);

    return {disbursementID: res.data.id, assetIssuer: walletRes.data[0].assets[0].issuer}

}

