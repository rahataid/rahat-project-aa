import { Asset, Horizon, TransactionBuilder, Networks, Operation, Keypair } from "@stellar/stellar-sdk";
import { logger } from "../../logger";
import { horizon_server } from "../../constants/horizon_server";

export const add_trustline = async (publicKey: string, secretKey: string, ASSET_Issuer: string, ASSET_code: string) => {

    logger.info('-----------------------------')
    logger.info(`Started adding trustline of RAHAT: ${ASSET_Issuer}`)
    try {
    const usdcAsset = new Asset(ASSET_code, ASSET_Issuer);

    console.log(usdcAsset)

    const server = new Horizon.Server(horizon_server);

    const account = await server.loadAccount(publicKey)

    logger.info(`Creating transaction to add trustline`)
    

    const transaction = new TransactionBuilder(account, {
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase: Networks.TESTNET
      })
      .addOperation(Operation.changeTrust({
        asset: usdcAsset,
      }))
      .setTimeout(100)
      .build();

      logger.warn("Created transaction successfully")
      logger.info("Signing transaction....")

      transaction.sign(Keypair.fromSecret(secretKey));

      logger.warn("Transaction signed successfully")


        logger.info("Submitting transaction...")
        await server.submitTransaction(transaction);
        logger.warn("Transaction submitted successfully")
        logger.warn("Added trustline successfully.")
        logger.info('-----------------------------')
      } catch (error) {
        console.log(error)
      }
    
}