import { getAuthToken, interactive_url } from '../lib/getTokens';
import { send_otp } from '../lib/sendOtp';
import { ag } from '../lib/axios/axiosGuest';
import { RECEIVER } from '../constants/routes';
import { ASSET, DISBURSEMENT, horizonServer } from '../constants/constant';
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
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

  public async getAssetInfo(): Promise<string> {
    return `${this.assetCode}:${this.assetIssuer}`;
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
    secretKey?: string
  ) {
    await axios.get(
      `${process.env['FRIEND_BOT_STELLAR']}?addr=${walletAddress}`
    );
    secretKey &&
      (await add_trustline(
        walletAddress,
        secretKey as string,
        this.assetIssuer,
        this.assetCode
      ));
    return { message: 'Funded successfully' };
  }

  public async sendAsset(senderSk: string, receiverPk: string, amount: string) {
    try {
      console.log({ senderSk, receiverPk, amount });
      console.log(`Sending ${amount} ${this.assetCode} to ${receiverPk} with issuer ${this.assetIssuer}`);
      const asset = new Asset(this.assetCode, this.assetIssuer);
      console.log(`Asset created: ${asset.code} issued by ${asset.issuer}`);
      const server = new Horizon.Server(horizonServer);

      const senderKeypair = Keypair.fromSecret(senderSk);
      const senderAccount = await server.loadAccount(senderKeypair.publicKey());
      console.log(`Sender account loaded: ${senderAccount.accountId}`);

      const transaction = new TransactionBuilder(senderAccount, {
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: receiverPk,
            asset,
            amount,
          })
        )
        .setTimeout(30)
        .build();

      transaction.sign(Keypair.fromSecret(senderSk));

      const tx = await server.submitTransaction(transaction);

      return { success: 'tokens sent', tx };
    } catch (error: any) {
      console.log(error.response.data.extras);
      throw error;
    }
  }

  public async getAccountBalance(wallet: string) {
    const server = new Horizon.Server(horizonServer);
    const account = await server.accounts().accountId(wallet).call();
    return account.balances;
  }
}
