import { Asset, Horizon } from '@stellar/stellar-sdk';
import { ASSET, horizonServer } from '../constants/constant';
import { ITransactionService } from '../types';
import { logger } from '../utils/logger';
import { transfer_asset } from '../lib/transferAsset';

export class TransactionService implements ITransactionService {
  // Initialize Horizon server
  private server: Horizon.Server;

  constructor() {
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

  public async hasTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string
  ): Promise<boolean> {
    try {
      const accountExists = await this.checkAccountExists(publicKey);

      if (!accountExists) {
        logger.warn('Account does not exist');
        return false;
      }

      const account = await this.server.loadAccount(publicKey);

      const trustlineExists = account.balances.some((balance: any) => {
        return (
          (balance.asset_type === 'credit_alphanum4' ||
            balance.asset_type === 'credit_alphanum12') &&
          balance.asset_code === assetCode &&
          balance.asset_issuer === assetIssuer
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
      const accountExists = await this.checkAccountExists(walletAddress);

      if (!accountExists) throw new Error('Account does not exist');

      const hasTrustline = await this.hasTrustline(
        walletAddress,
        ASSET.NAME,
        ASSET.ISSUER
      );

      if (!hasTrustline) throw new Error('Trustline does not exist');

      await transfer_asset(
        walletAddress,
        new Asset(ASSET.NAME, ASSET.ISSUER),
        amount
      );

      return { message: 'Funded successfully' };
    } catch (error: any) {
      throw new Error(error);
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
