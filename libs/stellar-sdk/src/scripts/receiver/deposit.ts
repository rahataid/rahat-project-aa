import { promptUser } from "../../utils/realLine"
import { getAuthToken } from "./get_auth_token"
import { interactive_url } from "./interactive"
import { send_otp } from "./send_otp"
import { verify_otp } from "./verify_token"

export const deposit = async (tenant_name: string, receiver_public_key: string, phone_number: string) => {
        
    const auth = await getAuthToken(tenant_name, receiver_public_key)

    const interactive = await interactive_url(receiver_public_key, auth?.data.token)

    await send_otp(phone_number, auth?.data.token)

    const otp = await promptUser('Enter OTP: ')
    const verification = await promptUser('Enter verification pin: ')

    await verify_otp(interactive?.data.url, otp as string, verification as string, phone_number)



}