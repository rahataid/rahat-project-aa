import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { BeneficiaryWallet } from '../types';
import { logger } from '../utils/logger';
import { checkAccountExists } from '../utils/checkAccountExists';

export const fundAccountXlm = async (
  keys: BeneficiaryWallet[],
  amount: string,
  faucetSecretKey: string,
  network: string,
  horizonServer: string
): Promise<string> => {
  const server = new Horizon.Server(horizonServer);
  if (!faucetSecretKey) {
    logger.error('FAUCET_SECRET_KEY is not set in environment variables');
  }
  const faucetKeypair = Keypair.fromSecret(faucetSecretKey);
  const faucetAccount = await server.loadAccount(faucetKeypair.publicKey());

  let txBuilder = new TransactionBuilder(faucetAccount, {
    fee: (await server.fetchBaseFee()).toString(),
    networkPassphrase:
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
  }).setTimeout(TimeoutInfinite);

  await Promise.all(
    keys.map(async (k) => {
      // Skip if account exists
      if (await checkAccountExists(k.address, horizonServer)) {
        logger.info(`Account exists, skipping funding ${k.address}`);
      } else {
        // If account doesn't exist, then create account
        logger.info(`Creating account ${k.address}`);
        txBuilder.addOperation(
          Operation.createAccount({
            destination: k.address,
            startingBalance: amount,
          })
        );
      }
    })
  );

  const tx = txBuilder.build();
  tx.sign(faucetKeypair);
  const txnResult = await server.submitTransaction(tx);

  logger.info(`Accounts created or funded successfully: ${txnResult.hash}`);
  return txnResult.hash;
};
