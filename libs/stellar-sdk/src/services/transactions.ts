import { Horizon } from '@stellar/stellar-sdk';
import { horizonServer } from '../constants/constant';
import { ITransactionService } from '../types';

export class TransactionService implements ITransactionService {
  public async getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ) {
    const server = new Horizon.Server(horizonServer);

    const payments = await server
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
      }) => ({
        asset: asset_code || 'XLM',
        created_at,
        hash: transaction_hash,
        amount: amount || '0',
        source: source_account,
      })
    );
  }
}
