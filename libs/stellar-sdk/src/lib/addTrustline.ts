import {
  Asset,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Keypair,
} from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { horizonServer } from '../constants/constant';

export const add_trustline = async (
  publicKey: string,
  secretKey: string,
  ASSET_Issuer: string,
  ASSET_code: string
) => {
  const usdcAsset = new Asset(ASSET_code, ASSET_Issuer);
  const server = new Horizon.Server(horizonServer);
  const account = await server.loadAccount(publicKey);

  const transaction = new TransactionBuilder(account, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: usdcAsset,
      })
    )
    .setTimeout(100)
    .build();

  transaction.sign(Keypair.fromSecret(secretKey));

  await server.submitTransaction(transaction);
  logger.warn('Added trustline successfully.');
};
