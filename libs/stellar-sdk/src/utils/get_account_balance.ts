import { Horizon } from "@stellar/stellar-sdk";
import { horizon_server } from '../constants/horizon_server';
import { logger } from "../logger";

export const get_account_balance = async (wallet: string) => {
    const server = new Horizon.Server(horizon_server);
    const account = await server.accounts().accountId(wallet).call();
    return account.balances;
}