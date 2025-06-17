import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { LOGS } from '../constants/logger';

export const transfer_asset = async (
  destination_address: string,
  asset: Asset,
  amount: string,
  assetSecret: string,
  horizonServer: string
) => {
  const issuerKeypair = Keypair.fromSecret(assetSecret);

  const server = new Horizon.Server(horizonServer);
  const account = await server.loadAccount(issuerKeypair.publicKey());

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: destination_address,
        asset,
        amount,
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(issuerKeypair);
  await server.submitTransaction(transaction);

  logger.warn(LOGS.WARN.TRANSFER_ASSET);
};
