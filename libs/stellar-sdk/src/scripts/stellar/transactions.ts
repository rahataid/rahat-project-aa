import { Horizon } from "@stellar/stellar-sdk";
import { horizon_server } from "../../constants/horizon_server";

export const get_transaction = async (pk: string) => {
    const server = new Horizon.Server(horizon_server);

    const payments = await server.payments()
    .forAccount(pk)
    .order('desc')
    .limit(5)
    .call();

    //@ts-ignore
    const filteredPayment = payments.records.map(({ asset_code, created_at, transaction_hash, amount, source_account }) => ({
        asset: asset_code || 'XLM',
        created_at,
        hash: transaction_hash,
        amount: amount || '0',
        source: source_account
      }))
      

    return filteredPayment;
}