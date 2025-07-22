import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
  rpc as StellarRpc,
} from '@stellar/stellar-sdk';
import { BeneficiaryWallet, ITransactionService } from '../types';
import { logger } from '../utils/logger';
import { transfer_asset } from '../lib/transferAsset';
import { add_trustline } from '../lib/addTrustline';
import { fundAccountXlm } from '../lib/xlmFaucet';
import { checkAccountExists } from '../utils/checkAccountExists';
import { sleep } from '../utils/sleep';
import axios from 'axios';

export class TransactionService implements ITransactionService {
  // Initialize Horizon server
  private server: Horizon.Server;
  private assetIssuer: string;
  private assetCode: string;
  private assetSecret: string;
  private horizonServer: string;
  private network: string;

  constructor(
    assetIssuer: string,
    assetCode: string,
    assetSecret: string,
    horizonServer: string,
    network: string
  ) {
    this.assetIssuer = assetIssuer;
    this.assetCode = assetCode;
    this.assetSecret = assetSecret;
    this.horizonServer = horizonServer;
    this.network = network;
    this.server = new Horizon.Server(horizonServer);
  }

  // Returns transactions for a wallet address
  public async getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ) {
    const payments = await this.server
      .payments()
      .forAccount(pk)
      .order(order)
      .limit(limit)
      .call();

    return payments.records.map(
      ({
        //@ts-ignore
        asset_code,
        created_at,
        transaction_hash,
        //@ts-ignore
        amount,
        source_account,
        //@ts-ignore
        from,
        //@ts-ignore
        to,
      }) => ({
        asset: asset_code || 'XLM',
        created_at,
        hash: transaction_hash,
        amount: amount || '0',
        source: source_account,
        amtColor: from === pk ? 'red' : to === pk ? 'green' : 'blue',
      })
    );
  }

  // Checks if the account has a trustline for the asset
  public async hasTrustline(publicKey: string): Promise<boolean> {
    try {
      const accountExists = await checkAccountExists(
        publicKey,
        this.horizonServer
      );

      if (!accountExists) {
        logger.warn('Account does not exist');
        return false;
      }

      const account = await this.server.loadAccount(publicKey);

      const trustlineExists = account.balances.some((balance: any) => {
        return (
          (balance.asset_type === 'credit_alphanum4' ||
            balance.asset_type === 'credit_alphanum12') &&
          balance.asset_code === this.assetCode &&
          balance.asset_issuer === this.assetIssuer
        );
      });

      return trustlineExists;
    } catch (error) {
      console.error('Error checking trustline:', error);
      return false;
    }
  }

  // Transfer Rahat token to a wallet address
  public async rahatFaucetService(walletAddress: string, amount: string) {
    try {
      const accountExists = await checkAccountExists(
        walletAddress,
        this.horizonServer
      );

      if (!accountExists) throw new Error('Account does not exist');

      const hasTrustline = await this.hasTrustline(walletAddress);

      if (!hasTrustline) throw new Error('Trustline does not exist');

      await transfer_asset(
        walletAddress,
        new Asset(this.assetCode, this.assetIssuer),
        amount,
        this.assetSecret,
        this.horizonServer,
        this.network
      );

      return { message: 'Funded successfully' };
    } catch (error: any) {
      throw new Error(error);
    }
  }

  // Fund multiple wallet addresses with XLM
  public async batchFundAccountXlm(
    keys: BeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType: 'internal' | 'external' = 'internal'
  ) {
    try {
      // Fund account with XLM
      const result = await fundAccountXlm(
        keys,
        amount,
        faucetSecretKey,
        this.network,
        this.horizonServer,
        faucetBaseUrl,
        faucetAuthKey,
        faucetType
      );

      // Wait for transaction confirmation only for internal faucet
      if (faucetType === 'internal') {
        await this.waitForTransactionConfirmation(result);
      } else {
        logger.info('Skipping transaction confirmation for external faucet');
      }

      // Add trustline for all wallet addresses

      await Promise.all(
        keys.map(async (k) => {
          await add_trustline(
            k.address,
            k.secret,
            this.assetIssuer,
            this.assetCode,
            this.horizonServer,
            this.network
          );
        })
      );
      return {
        message: `Funded successfully for ${keys.length} wallets: ${
          faucetType === 'internal' ? result : 'external faucet'
        }`,
      };
    } catch (error: any) {
      return error?.response;
    }
  }

  public async sendAsset(senderSk: string, receiverPk: string, amount: string) {
    try {
      const asset = new Asset(this.assetCode, this.assetIssuer);
      const server = new Horizon.Server(this.horizonServer);

      const senderKeypair = Keypair.fromSecret(senderSk);
      const senderAccount = await server.loadAccount(senderKeypair.publicKey());
      console.log(`Sender account loaded: ${senderAccount.accountId}`);

      const transaction = new TransactionBuilder(senderAccount, {
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase:
          this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
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
      const server = new Horizon.Server(this.horizonServer);
      const account = await server.accounts().accountId(wallet).call();
      return account.balances;
    } catch (error: any) {
      return error;
    }
  }

  public async checkAccountExists(wallet: string): Promise<boolean> {
    try {
      const server = new Horizon.Server(this.horizonServer);
      await server.accounts().accountId(wallet).call();
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }

  public async getAssetInfo(): Promise<string> {
    return `${this.assetCode}:${this.assetIssuer}`;
  }

  private async waitForTransactionConfirmation(
    transactionHash: string
  ): Promise<any> {
    const server = new Horizon.Server(this.horizonServer);
    const startTime = Date.now();
    const timeoutMs = 60000;
    while (Date.now() - startTime < timeoutMs) {
      try {
        const txResponse = await server
          .transactions()
          .transaction(transactionHash)
          .call();
        logger.info(
          `Transaction status for transaction ${transactionHash}: ${txResponse.successful}`
        );

        if (txResponse.successful) {
          return txResponse;
        } else {
          logger.error(`Transaction failed: ${JSON.stringify(txResponse)}`);
          throw new Error(`Transaction failed: ${txResponse.result_xdr}`);
        }
      } catch (error: any) {
        if (error.response && error.response.status === 404) {
          // Transaction not found yet, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
          logger.info(`Transaction not found yet, retrying ${transactionHash}`);
        } else {
          logger.error(
            `Error checking transaction status for transaction ${transactionHash}: ${error.message}`
          );
          throw error;
        }
      }
    }
    throw new Error(
      `Transaction confirmation timed out for transaction ${transactionHash} after ${timeoutMs}ms`
    );
  }
}
