import { logger } from "../../logger"
import { RECEIVER } from "../../routes/receiver"
import { ar } from "../../utils/axiosGuest"

export const interactive_url = async (receiver_public_key: string, token: string) => {

    const formdata = new FormData()

    formdata.append('asset_code', 'RAHAT')
    formdata.append('account', receiver_public_key)
    formdata.append('claimable_balance_supported', 'false')
    formdata.append('lang', 'en')

    logger.warn("Generated token for receiver")

    logger.info("Generating URL for receiver to visit...")

        const interactive = await ar.post(RECEIVER.INTERACTIVE, 
            formdata,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": 'multipart/form-data; boundary=----WebKitFormBoundaryAwgapqx3AgKQPQe0'
            }
        }
        )

    logger.info(`You can also claim by visitng this URL: ${interactive?.data.url}`)

    logger.info('Sending OTP to receiver')

    return interactive;
    
}