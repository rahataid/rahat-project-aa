import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import axios from 'axios';
import { add_trustline } from '../lib/addTrustline';
import { IReceiveService } from '../types';
import { logger } from '../utils/logger';
import { horizonServer } from '../constants';

export class ReceiveService implements IReceiveService {
  private assetIssuer: string;
  private assetCode: string;
  private network: string;
  private faucetSecretKey: string;
  private faucetAuthKey: string;
  private faucetBaseUrl: string;

  constructor(
    assetIssuer: string,
    assetCode: string,
    network: string,
    faucetSecretKey: string,
    fundingAmount: string,
    faucetBaseUrl: string
  ) {
    this.assetIssuer = assetIssuer;
    this.assetCode = assetCode;
    this.network = network;
    this.faucetSecretKey = faucetSecretKey;
    this.faucetAuthKey = fundingAmount;
    this.faucetBaseUrl = faucetBaseUrl;
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
      this.assetCode,
      horizonServer
    );
    return keypair;
  }

  public async faucetAndTrustlineService(
    walletAddress: string,
    receiverSecretKey?: string
  ) {
    try {
      const accountExists = await this.checkAccountExists(walletAddress);

      if (!this.faucetSecretKey) {
        logger.error('Faucet secret key not found');
        throw new Error('Faucet secret key not found');
      }

      if (!accountExists) {
        logger.warn('Funding account');
        await this.fundAccount(walletAddress);
      } else {
        logger.warn('Skipping funding');
      }

      receiverSecretKey &&
        (await add_trustline(
          walletAddress,
          receiverSecretKey as string,
          this.assetIssuer,
          this.assetCode,
          horizonServer
        ));
      return { message: 'Funded successfully' };
    } catch (error) {
      return error;
    }
  }

  private async fundAccount(receiverPk: string): Promise<any> {
    try {
      logger.warn(`Requesting faucet funding for ${receiverPk}...`);

      const networkName =
        this.network === 'mainnet' ? 'stellar_mainnet' : 'stellar_testnet';
      const faucetUrl = `${this.faucetBaseUrl}/faucet/${networkName}/${receiverPk}`;

      const response = await axios.get(faucetUrl, {
        headers: {
          Authorization: `Bearer ${this.faucetAuthKey}`,
        },
      });

      logger.warn(`Successfully funded ${receiverPk} from external faucet`);
      return {
        success: 'XLM sent to account from external faucet',
        response: response.data,
      };
    } catch (error: any) {
      logger.error(`Error in fundAccount: ${error.message}`, error.stack);
      if (error.response?.data) {
        logger.error('Faucet API error details:', error.response.data);
      }
      throw error;
    }
  }

  // Use this for internal faucet
  // private async fundAccount(
  //   receiverPk: string,
  //   amount: string,
  //   faucetSecretKey: string
  // ) {
  //   try {
  //     const server = new Horizon.Server(horizonServer);
  //     const faucetKeypair = Keypair.fromSecret(faucetSecretKey);
  //     const faucetAccount = await server.loadAccount(faucetKeypair.publicKey());

  //     const transaction = new TransactionBuilder(faucetAccount, {
  //       fee: (await server.fetchBaseFee()).toString(),
  //       networkPassphrase:
  //         this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
  //     })
  //       .addOperation(
  //         Operation.createAccount({
  //           destination: receiverPk,
  //           startingBalance: amount,
  //         })
  //       )
  //       .setTimeout(30)
  //       .build();

  //     transaction.sign(faucetKeypair);
  //     const tx = await server.submitTransaction(transaction);

  //     logger.warn(`Funded ${receiverPk} with ${amount} XLM`);
  //     return { success: 'XLM sent to account', tx };
  //   } catch (error: any) {
  //     logger.error(`Error in fundAccount: ${error.message}`, error.stack);
  //     if (error.response?.data?.extras) {
  //       logger.error('Stellar error details:', error.response.data.extras);
  //     }
  //     throw error;
  //   }
  // }

  public async sendAsset(senderSk: string, receiverPk: string, amount: string) {
    try {
      const asset = new Asset(this.assetCode, this.assetIssuer);
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
    try {
      const server = new Horizon.Server(horizonServer);
      const account = await server.accounts().accountId(wallet).call();
      return account.balances;
    } catch (error: any) {
      return error;
    }
  }

  public async checkAccountExists(wallet: string): Promise<boolean> {
    try {
      const server = new Horizon.Server(horizonServer);
      await server.accounts().accountId(wallet).call();
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }
}
