import { logger } from "../../logger"
import { RECEIVER } from "../../routes/receiver"
import { ag } from "../../utils/axiosGuest"

export const send_otp = async (phone_number: string, token: string) => {
    try {
        await ag.post(RECEIVER.SEND_OTP, {
            phone_number,
        }, 
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        logger.warn('Sent OTP successfully')
    } catch (error) {
        console.log(error)
    }
    


}