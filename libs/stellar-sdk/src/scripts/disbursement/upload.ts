import { axiosInstance } from "../../utils/axiosInstance"
const FormData = require('form-data');
import { logger } from "../../logger";
import { DISBURSEMENT } from "../../routes/disbursement";
import { LOGS } from "../../constants/logger";

export const uploadDisbursementFile = async (disbursementID: string, file: any) => {
    
    const formData = new FormData();

    formData.append('file', file.buffer, file.originalname);

    try {
        await axiosInstance.post(DISBURSEMENT.UPLOAD(disbursementID), formData, {
            headers: {
                ...formData.getHeaders()
            }
        }
        )

        logger.warn(LOGS.WARN.DISBURSEMENT_UPLOAD)
    } 
    

    catch (error) {
        console.log(error);
        throw error;
    }
}