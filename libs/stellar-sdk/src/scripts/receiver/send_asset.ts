import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ASSET } from "../../constants/asset";
import { horizon_server } from "../../constants/horizon_server";
import { get_balance } from "../../utils/get_balance";
import { logger } from "../../logger";
import { sleep } from "../../utils/sleep";

export const send_asset = async (senderSk: string, receiverPk: string) => {

    logger.info('Sleeping for 10 seconds');
    
    await sleep(30000);

    logger.info("Sending token to vendor");

    try {
    const asset = new Asset(ASSET.NAME, ASSET.ISSUER);

    const server = new Horizon.Server(horizon_server);

    console.log(senderSk)

    const senderKeypair = Keypair.fromSecret(senderSk);
    const senderAccount = await server.loadAccount(senderKeypair.publicKey());

    const balances = await get_balance(senderKeypair.publicKey());

    console.log(balances);

    const amount = await balances?.find(balance => balance.asset === ASSET.NAME)?.balance.split('.')[0] || "0";

    console.log(amount)

    const transaction = new TransactionBuilder(senderAccount, {
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: Networks.TESTNET
    })
    .addOperation(
        Operation.payment({
            destination: receiverPk,
            asset,
            amount
        })
    )
    .setTimeout(30)
    .build();

    transaction.sign(Keypair.fromSecret(senderSk));

    await server.submitTransaction(transaction);

    return {success: 'tokens sent to vendor'}
    } catch (error) {
        return {error, msg: "Error sending tokens to vendor"}
    }

}