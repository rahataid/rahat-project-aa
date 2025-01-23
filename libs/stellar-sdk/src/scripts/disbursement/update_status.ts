import { LOGS } from "../../constants/logger"
import { logger } from "../../logger"
import { DISBURSEMENT } from "../../routes/disbursement"
import { axiosInstance } from "../../utils/axiosInstance"

export const updateDisbursementStatus = async (status: string, disbursementId: string) => {
    logger.info(LOGS.INFO.UPDATE_STATUS)
    try {
        const res = await axiosInstance.patch(DISBURSEMENT.UPDATE(disbursementId), {
            status: "STARTED"
        })

    logger.warn(LOGS.WARN.UPDATE_STATUS(status, disbursementId))

    } catch (error) {
        logger.error(error)
    }
    
}