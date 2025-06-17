import {
  Asset,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Keypair,
} from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

export const add_trustline = async (
  publicKey: string,
  secretKey: string,
  ASSET_Issuer: string,
  ASSET_code: string,
  horizonServer: string
) => {
  logger.warn('Adding trustline...');

  if (!ASSET_code || !ASSET_Issuer) {
    logger.error('Asset code or issuer not found');
    throw new Error('Asset code or issuer not found');
  }

  if (!publicKey || !secretKey) {
    logger.error('Public key or secret key not found');
    throw new Error('Public key or secret key not found');
  }

  const rahatAsset = new Asset(ASSET_code, ASSET_Issuer);

  const server = new Horizon.Server(horizonServer);
  const account = await server.loadAccount(publicKey);

  const transaction = new TransactionBuilder(account, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: rahatAsset,
      })
    )
    .setTimeout(100)
    .build();

  transaction.sign(Keypair.fromSecret(secretKey));

  await server.submitTransaction(transaction);
  logger.warn('Added trustline successfully.');
};
