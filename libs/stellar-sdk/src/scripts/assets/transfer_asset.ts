import {Keypair, Horizon, TransactionBuilder, Networks, Operation, Asset, BASE_FEE} from "@stellar/stellar-sdk"
import { logger } from "../../logger";
import { ASSET } from "../../constants/asset";
import { horizon_server } from "../../constants/horizon_server";
import { LOGS } from "../../constants/logger";

export const transfer_asset = async (destination_address: string, asset: Asset) => {

    logger.info(LOGS.INFO.TRANSFER_ASSET(asset.code, destination_address))

    const issuerKeypair = Keypair.fromSecret(ASSET.SECERT);

    const server = new Horizon.Server(horizon_server);
    const account = await server.loadAccount(issuerKeypair.publicKey());

    const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: destination_address,
            asset,
            amount: ASSET.AMOUNT,
          })
        )
        .setTimeout(30)
        .build();
   
      transaction.sign(issuerKeypair);
      await server.submitTransaction(transaction);

      logger.warn(LOGS.WARN.TRANSFER_ASSET)
}