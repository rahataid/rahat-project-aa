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
  try {
    console.log(
      'Funding accounts: ',
      keys.length,
      amount,
      faucetSecretKey,
      network
    );

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

    const accountsToCreate = keys.filter(
      async (k) => !(await checkAccountExists(k.address, horizonServer))
    );

    if (accountsToCreate.length === 0) {
      logger.info('All accounts already exist');
      return 'All accounts already exist';
    }

    for (const k of accountsToCreate) {
      logger.info(`Creating account ${k.address}`);
      txBuilder.addOperation(
        Operation.createAccount({
          destination: k.address,
          startingBalance: amount,
        })
      );
    }

    const tx = txBuilder.build();
    tx.sign(faucetKeypair);
    const txnResult = await server.submitTransaction(tx);

    logger.info(`Accounts created or funded successfully: ${txnResult.hash}`);
    return txnResult.hash;
  } catch (error: any) {
    console.log('Error funding accounts: ', error?.response?.data || error);
    throw error;
  }
};
