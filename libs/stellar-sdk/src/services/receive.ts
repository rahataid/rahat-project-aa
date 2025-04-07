import { getAuthToken, interactive_url } from '../lib/getTokens';
import { send_otp } from '../lib/sendOtp';
import { ag } from '../lib/axios/axiosGuest';
import { RECEIVER } from '../constants/routes';
import { ASSET, DISBURSEMENT } from '../constants/constant';
import { Keypair } from '@stellar/stellar-sdk';
import { add_trustline } from '../lib/addTrustline';
import axios from 'axios';
import { IReceiveService } from '../types';

export class ReceiveService implements IReceiveService {
  private assetIssuer: string;
  private assetCode: string;

  constructor(
    assetIssuer: string = ASSET.ISSUER,
    assetCode: string = ASSET.NAME
  ) {
    this.assetIssuer = assetIssuer;
    this.assetCode = assetCode;
  }

  public async createReceiverAccount(): Promise<any> {
    const account = Keypair.random();
    const keypair = {
      secretKey: account.secret(),
      publicKey: account.publicKey(),
    };
    await add_trustline(
      keypair.publicKey,
      keypair.secretKey,
      this.assetIssuer,
      this.assetCode
    );
    return keypair;
  }

  public async sendOTP(
    tenantName: string,
    receiverPublicKey: string,
    phoneNumber: string
  ): Promise<any> {
    const auth = await getAuthToken(tenantName, receiverPublicKey);

    const interactive = await interactive_url(
      receiverPublicKey,
      auth?.data.token
    );
    const url = new URL(interactive?.data.url);
    const verifyToken = url.searchParams.get('token') as string;
    try {
      await send_otp(phoneNumber, auth?.data.token);
    } catch (error) {
      console.log(error);
    }

    return { verifyToken };
  }

  public async verifyOTP(
    auth: string,
    phoneNumber: string,
    otp: string,
    verification: string
  ): Promise<any> {
    console.log(auth, phoneNumber, otp, verification);

    const res = ag.post(
      RECEIVER.VERIFY_OTP,
      {
        phone_number: phoneNumber,
        otp,
        verification,
        verification_type: DISBURSEMENT.VERIFICATION,
      },
      {
        headers: {
          Authorization: `Bearer ${auth}`,
        },
      }
    );

    return 'Success';
  }

  public async faucetAndTrustlineService(
    walletAddress: string,
    secretKey: string
  ) {
    await axios.get(
      `${process.env['FRIEND_BOT_STELLAR']}?addr=${walletAddress}`
    );
    await add_trustline(
      walletAddress,
      secretKey,
      this.assetIssuer,
      this.assetCode
    );
    return { message: 'Funded successfully' };
  }
}
