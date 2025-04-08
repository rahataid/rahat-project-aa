import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { ASSET, horizonServer } from '../constants/constant';
import { sleep } from '../utils/sleep';
import { getBalance } from '../utils/getBalance';

export const sendAsset = async (senderSk: string, receiverPk: string) => {
  await sleep(30000);
  const asset = new Asset(ASSET.NAME, ASSET.ISSUER);
  const server = new Horizon.Server(horizonServer);
  const senderKeypair = Keypair.fromSecret(senderSk);
  const senderAccount = await server.loadAccount(senderKeypair.publicKey());

  const balances = await getBalance(senderKeypair.publicKey());

  const amount =
    (await balances
      ?.find((balance) => balance.asset === ASSET.NAME)
      ?.balance.split('.')[0]) || '0';

  const transaction = new TransactionBuilder(senderAccount, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: receiverPk,
        asset,
        amount,
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(Keypair.fromSecret(senderSk));
  await server.submitTransaction(transaction);
  return { success: 'tokens sent to vendor' };
};
