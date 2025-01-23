import { DISBURSEMENT } from "../../constants/disbursement"
import { logger } from "../../logger"
import { RECEIVER } from "../../routes/receiver"
import { ag } from "../../utils/axiosGuest"

export const verify_otp = async (Authorization: string, phone_number: string, otp: string, verification: string) => {

    logger.info('Verifying OTP...')
    try {
        const res = await ag.post(RECEIVER.VERIFY_OTP, 
            {
                phone_number,
                otp,
                verification,
                verification_type: DISBURSEMENT.VERIFICATION
            },
            {
                headers: {
                    Authorization
                }
            }
        )
        return res;

    } catch (error: any) {
        throw error.response.data;
    }
    
    
}