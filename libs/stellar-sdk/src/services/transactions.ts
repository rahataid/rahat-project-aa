import { get_transaction } from "../scripts/stellar/transactions";

export class TransactionService {
    public async getTransaction(pk: string) {
        return get_transaction(pk)
    }
}