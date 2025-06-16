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
import { horizonServer } from '../constants';
import { add_trustline } from '../lib/addTrustline';
import { fundAccountXlm } from '../lib/internalXlmFaucet';
import { checkAccountExists } from '../utils/checkAccountExists';

export class TransactionService implements ITransactionService {
  // Initialize Horizon server
  private server: Horizon.Server;
  private assetIssuer: string;
  private assetCode: string;
  private assetSecret: string;

  constructor(assetIssuer: string, assetCode: string, assetSecret: string) {
    this.assetIssuer = assetIssuer;
    this.assetCode = assetCode;
    this.assetSecret = assetSecret;
    this.server = new Horizon.Server(horizonServer);
  }

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

  public async hasTrustline(publicKey: string): Promise<boolean> {
    try {
      const accountExists = await checkAccountExists(publicKey);

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

  public async rahatFaucetService(walletAddress: string, amount: string) {
    try {
      const accountExists = await checkAccountExists(walletAddress);

      if (!accountExists) throw new Error('Account does not exist');

      const hasTrustline = await this.hasTrustline(walletAddress);

      if (!hasTrustline) throw new Error('Trustline does not exist');

      await transfer_asset(
        walletAddress,
        new Asset(this.assetCode, this.assetIssuer),
        amount,
        this.assetSecret,
        horizonServer
      );

      return { message: 'Funded successfully' };
    } catch (error: any) {
      throw new Error(error);
    }
  }

  public async batchFundAccountXlm(
    keys: BeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    network: string,
    sorobanServer: string
  ) {
    try {
      // Fund account with XLM
      const txHash = await fundAccountXlm(
        keys,
        amount,
        faucetSecretKey,
        network
      );

      // Wait for transaction confirmation
      await this.waitForTransactionConfirmation(txHash, sorobanServer);

      // Add trustline for all wallet addresses
      await Promise.all(
        keys.map(async (k) => {
          await add_trustline(
            k.address,
            k.secret,
            this.assetIssuer,
            this.assetCode,
            horizonServer
          );
        })
      );
      return {
        message: `Funded successfully for ${keys.length} wallets: ${txHash}`,
      };
    } catch (error: any) {
      logger.error(error?.response);
      return error?.response;
    }
  }

  private async waitForTransactionConfirmation(
    transactionHash: string,
    sorobanServer: string
  ): Promise<any> {
    const server = new StellarRpc.Server(sorobanServer);
    const startTime = Date.now();
    const timeoutMs = 60000;
    while (Date.now() - startTime < timeoutMs) {
      try {
        const txResponse = await server.getTransaction(transactionHash);
        logger.info(
          `Transaction status for transaction ${transactionHash}: ${txResponse.status}`
        );

        if (txResponse.status === 'SUCCESS') {
          return txResponse;
        } else if (txResponse.status === 'FAILED') {
          logger.error(`Transaction failed: ${JSON.stringify(txResponse)}`);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          logger.info(`Retrying ${transactionHash}`);
        }
      } catch (error: any) {
        logger.error(
          `Error checking transaction status for transaction ${transactionHash}: ${error.message}`
        );
        throw error;
      }
    }
    throw new Error(
      `Transaction confirmation timed out for transaction ${transactionHash} after ${timeoutMs}ms`
    );
  }
}
