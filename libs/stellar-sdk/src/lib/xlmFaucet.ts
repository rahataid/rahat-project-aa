import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk';
import { BeneficiaryWallet } from '../types';
import { logger } from '../utils/logger';
import { checkAccountExists } from '../utils/checkAccountExists';
import axios from 'axios';

export const fundAccountXlm = async (
  keys: BeneficiaryWallet[],
  amount: string,
  faucetSecretKey: string,
  network: string,
  horizonServer: string,
  faucetBaseUrl?: string,
  faucetAuthKey?: string,
  faucetType: 'internal' | 'external' = 'internal'
): Promise<string> => {
  try {
    console.log(
      'Funding accounts: ',
      keys.length,
      amount,
      faucetSecretKey,
      network,
      'faucetType:',
      faucetType
    );

    if (faucetType === 'external') {
      return await fundAccountsExternal(
        keys,
        network,
        faucetBaseUrl,
        faucetAuthKey
      );
    } else {
      return await fundAccountsInternal(
        keys,
        amount,
        faucetSecretKey,
        network,
        horizonServer
      );
    }
  } catch (error: any) {
    console.log('Error funding accounts: ', error?.response?.data || error);
    throw error;
  }
};

const fundAccountsInternal = async (
  keys: BeneficiaryWallet[],
  amount: string,
  faucetSecretKey: string,
  network: string,
  horizonServer: string
): Promise<string> => {
  const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org/');
  const server = new Horizon.Server(horizonServer);
  if (!faucetSecretKey) {
    logger.error('FAUCET_SECRET_KEY is not set in environment variables');
  }
  const faucetKeypair = Keypair.fromSecret(faucetSecretKey);
  const faucetAccount = await rpcServer.getAccount(faucetKeypair.publicKey());

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
  const txnResult = await rpcServer.sendTransaction(tx);

  logger.info(`Accounts created or funded successfully: ${txnResult.hash}`);
  return txnResult.hash;
};

const fundAccountsExternal = async (
  keys: BeneficiaryWallet[],
  network: string,
  faucetBaseUrl?: string,
  faucetAuthKey?: string
): Promise<string> => {
  if (!faucetBaseUrl || !faucetAuthKey) {
    throw new Error(
      'faucetBaseUrl and faucetAuthKey are required for external faucet'
    );
  }

  const networkName =
    network === 'mainnet' ? 'stellar_mainnet' : 'stellar_testnet';
  const results = [];
  let lastFaucetId: string | null = null;

  for (const key of keys) {
    try {
      logger.warn(`Requesting external faucet funding for ${key.address}...`);

      const faucetUrl = `${faucetBaseUrl}/faucet/${networkName}/${key.address}`;

      const response = await axios.get(faucetUrl, {
        headers: {
          Authorization: `Bearer ${faucetAuthKey}`,
        },
      });

      logger.warn(`Faucet request submitted for ${key.address}`);

      console.log(response);

      // Extract faucet ID from response
      const faucetId = response.data?.faucetRequest.id;

      if (faucetId) {
        lastFaucetId = faucetId;
        logger.info(`Faucet ID for ${key.address}: ${faucetId}`);

        // Poll for status until SUCCESS
        const status = await pollFaucetStatus(
          faucetBaseUrl,
          faucetId,
          faucetAuthKey
        );

        if (status === 'COMPLETED') {
          logger.info(
            `Faucet request completed successfully for ${key.address}`
          );
          results.push({
            address: key.address,
            success: true,
            faucetId: faucetId,
            status: status,
          });
        } else {
          logger.error(
            `Faucet request failed for ${key.address}, status: ${status}`
          );
          results.push({
            address: key.address,
            success: false,
            faucetId: faucetId,
            status: status,
          });
        }
      } else {
        logger.error(`No faucet ID found in response for ${key.address}`);
        results.push({
          address: key.address,
          success: false,
          error: 'No faucet ID in response',
        });
      }
    } catch (error: any) {
      logger.error(
        `Error funding ${key.address} from external faucet: ${error.message}`,
        error.stack
      );
      if (error.response?.data) {
        logger.error('External faucet API error details:', error.response.data);
      }
      results.push({
        address: key.address,
        success: false,
        error: error.message,
      });
    }
  }

  const successfulFunds = results.filter((r) => r.success);
  const failedFunds = results.filter((r) => !r.success);

  logger.info(
    `External faucet results: ${successfulFunds.length} successful, ${failedFunds.length} failed`
  );

  if (failedFunds.length > 0) {
    logger.warn('Some accounts failed to fund:', failedFunds);
  }

  // Return summary for external faucet
  return `External faucet completed: ${successfulFunds.length} successful, ${failedFunds.length} failed`;
};

const pollFaucetStatus = async (
  baseUrl: string,
  faucetId: string,
  apiKey: string,
  maxAttempts: number = 30,
  delayMs: number = 2000
): Promise<string> => {
  const statusUrl = `${baseUrl}/faucet/${faucetId}?api_key=${apiKey}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(
        `Polling faucet status (attempt ${attempt}/${maxAttempts}) for ID: ${faucetId}`
      );

      const response = await axios.get(statusUrl);
      const status = response.data?.status;

      logger.info(`Faucet status for ${faucetId}: ${status}`);

      if (status === 'COMPLETED') {
        logger.info(`Faucet request ${faucetId} completed successfully`);
        return status;
      } else if (status === 'FAILED') {
        logger.error(`Faucet request ${faucetId} failed`);
        return status;
      } else if (status === 'PENDING') {
        logger.info(
          `Faucet request ${faucetId} still pending, waiting ${delayMs}ms before next poll`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        logger.warn(`Unknown faucet status for ${faucetId}: ${status}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error: any) {
      logger.error(
        `Error polling faucet status for ${faucetId}: ${error.message}`
      );
      if (attempt === maxAttempts) {
        logger.error(`Max polling attempts reached for faucet ${faucetId}`);
        return 'FAILED';
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.error(
    `Polling timeout for faucet ${faucetId} after ${maxAttempts} attempts`
  );
  return 'FAILED';
};
