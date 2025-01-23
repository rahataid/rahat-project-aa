import { getAuthToken } from "../scripts/receiver/get_auth_token";
import { interactive_url } from "../scripts/receiver/interactive";
import { send_asset } from "../scripts/receiver/send_asset";
import { send_otp } from "../scripts/receiver/send_otp";
import { verify_otp } from "../scripts/receiver/verify_token";
import { retrive_token } from "../utils/retrive_token";

export class OtpService {

    public async sendOTP(tenantName: string, receiverPublicKey: string, phoneNumber: string): Promise<any> {
        const auth = await getAuthToken(tenantName, receiverPublicKey);
        const interactive = await interactive_url(receiverPublicKey, auth?.data.token);

        await send_otp(phoneNumber, auth?.data.token);

        return {verifyToken: retrive_token(interactive?.data.url) as string};
    }

    public async verifyOTP(auth: string, phoneNumber: string, otp: string, verification: string): Promise<any> {
        return verify_otp(auth, phoneNumber, otp, verification);
    }

    public async sendAsset(senderSk: string, receiverPk: string) {
        return send_asset(senderSk, receiverPk);
    }
}
