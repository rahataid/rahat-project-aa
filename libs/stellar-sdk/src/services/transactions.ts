import { Horizon } from '@stellar/stellar-sdk';
import { horizonServer } from '../constants/constant';
import { ITransactionService } from '../types';

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
}
