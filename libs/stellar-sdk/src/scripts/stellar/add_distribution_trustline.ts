import { LOGS } from "../../constants/logger"
import { logger } from "../../logger"
import { STELLAR } from "../../routes/stellar"
import { axiosInstance } from "../../utils/axiosInstance"

export const add_disbursement_trustline = async (code: string, issuer: string) => {
    logger.info(LOGS.INFO.TRUSTLINE)
    try {
        await axiosInstance.post(STELLAR.ASSET, {
            code,
            issuer
        })
    } catch (error) {
        console.log(error)
    }
    

    logger.warn(LOGS.WARN.TRUSTLINE)
}