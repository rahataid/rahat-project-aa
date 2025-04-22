import { logger } from "../../logger"
import { RECEIVER } from "../../routes/receiver";
import { ar, as } from "../../utils/axiosGuest"

export const getAuthToken = async (tenant_name: string, receiver_public_key: string) => {

    logger.info("Generating token for receiver...")

    const home_domain = RECEIVER.HOME_DOMAIN(tenant_name);
    const account = await ar.get(RECEIVER.AUTH, 
        {
            params: {
                account: receiver_public_key,
                home_domain,
                client_domain: RECEIVER.CLIENT_DOMAIN
            }
        }
    )
    const sign = await as.post(RECEIVER.SIGN, account.data)
    const auth = await ar.post(RECEIVER.AUTH, {transaction: sign.data.transaction})

    return auth

}