import { AxiosInstance } from 'axios';
import { AuthService } from '../auth.service';
import { API_ROUTES } from '../../constants/routes';
import {
  TransactionError,
  TrustlineError,
  AccountNotFoundError,
  TransactionAssetTransferError,
  TransactionConfirmationError,
} from '../../core/errors/transaction.errors';
import {
  ITransaction,
  ITransactionResult,
  ISendAssetResult,
  IAccountBalance,
  IBeneficiaryWallet,
  IBatchFundResult,
  ITransactionService,
} from '../../core/interfaces/transaction.interface';
import axios from 'axios';
import {
  Keypair,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
  Horizon,
  Asset,
} from '@stellar/stellar-sdk';
import { logger } from '../../utils/logger';
import { checkAccountExists } from '../../utils/checkAccountExists';
import { addTrustline } from '../../utils/stellar.utils';

export class TransactionApiService implements ITransactionService {
  private get axiosInstance(): AxiosInstance {
    return this.authService.getAxiosInstance();
  }

  private readonly assetIssuer: string;
  private readonly assetCode: string;
  private readonly assetSecret: string;
  private readonly horizonServer: string;
  private readonly network: string;

  constructor(
    private readonly authService: AuthService,
    assetIssuer: string,
    assetCode: string,
    assetSecret: string,
    horizonServer: string,
    network: string
  ) {
    this.assetIssuer = assetIssuer;
    this.assetCode = assetCode;
    this.assetSecret = assetSecret;
    this.horizonServer = horizonServer;
    this.network = network;
  }

  public async getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ): Promise<ITransaction[]> {
    try {
      const server = new Horizon.Server(this.horizonServer);
      const payments = await server
        .payments()
        .forAccount(pk)
        .order(order)
        .limit(limit)
        .call();

      return payments.records.map(
        ({
          asset_code,
          created_at,
          transaction_hash,
          amount,
          source_account,
          from,
          to,
        }: any) => ({
          asset: asset_code || 'XLM',
          created_at,
          hash: transaction_hash,
          amount: amount || '0',
          source: source_account,
          amtColor: from === pk ? 'red' : to === pk ? 'green' : 'blue',
        })
      );
    } catch (error: any) {
      throw new TransactionError(
        `Failed to get transactions: ${error.message}`
      );
    }
  }

  public async hasTrustline(publicKey: string): Promise<boolean> {
    await this.authService.getToken();
    try {
      const response = await this.axiosInstance.get(
        `${API_ROUTES.STELLAR.ASSET}/accounts/${publicKey}`
      );

      const account = response.data;
      const trustlineExists = account.balances.some((balance: any) => {
        return (
          (balance.asset_type === 'credit_alphanum4' ||
            balance.asset_type === 'credit_alphanum12') &&
          balance.asset_code &&
          balance.asset_issuer
        );
      });

      return trustlineExists;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      throw new TrustlineError(`Failed to check trustline: ${error.message}`);
    }
  }

  public async rahatFaucetService(
    walletAddress: string,
    amount: string
  ): Promise<ITransactionResult> {
    await this.authService.getToken();
    try {
      const accountExists = await this.checkAccountExists(walletAddress);
      if (!accountExists) {
        throw new AccountNotFoundError(walletAddress);
      }

      const hasTrustline = await this.hasTrustline(walletAddress);
      if (!hasTrustline) {
        throw new TrustlineError('Trustline does not exist');
      }

      const response = await this.axiosInstance.post(
        `${API_ROUTES.STELLAR.ASSET}/transfer`,
        {
          destination: walletAddress,
          amount,
        }
      );

      return { message: 'Funded successfully' };
    } catch (error: any) {
      if (
        error instanceof AccountNotFoundError ||
        error instanceof TrustlineError
      ) {
        throw error;
      }
      throw new TransactionAssetTransferError(
        `Failed to fund account: ${error.message}`
      );
    }
  }

  public async fundAccounts(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType: 'internal' | 'external' = 'internal'
  ): Promise<IBatchFundResult> {
    await this.authService.getToken();
    try {
      let fundingResult: string;
      let successfulKeys: IBeneficiaryWallet[] = [];

      if (faucetType === 'external') {
        // External faucet logic (adapted from xlmFaucet.ts)
        if (!faucetBaseUrl || !faucetAuthKey) {
          throw new TransactionAssetTransferError(
            'faucetBaseUrl and faucetAuthKey are required for external faucet'
          );
        }
        const networkName =
          sorobanServer === 'mainnet' ? 'stellar_mainnet' : 'stellar_testnet';
        const results: any[] = [];
        let lastFaucetId: string | null = null;
        for (const key of keys) {
          try {
            logger.warn(
              `Requesting external faucet funding for ${key.address}...`
            );
            const faucetUrl = `${faucetBaseUrl}/faucet/${networkName}/${key.address}`;
            const response = await axios.get(faucetUrl, {
              headers: {
                Authorization: `Bearer ${faucetAuthKey}`,
              },
            });
            logger.warn(`Faucet request submitted for ${key.address}`);
            const faucetId = response.data?.faucetRequest?.id;
            if (faucetId) {
              lastFaucetId = faucetId;
              logger.info(`Faucet ID for ${key.address}: ${faucetId}`);
              // Poll for status until COMPLETED
              const status = await this.pollFaucetStatus(
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
                  faucetId,
                  status,
                });
                successfulKeys.push(key); // Add to successful keys for trustline
              } else {
                logger.error(
                  `Faucet request failed for ${key.address}, status: ${status}`
                );
                results.push({
                  address: key.address,
                  success: false,
                  faucetId,
                  status,
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
              `Error funding ${key.address} from external faucet: ${error.message}`
            );
            if (error.response?.data) {
              logger.error(
                'External faucet API error details:',
                error.response.data
              );
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
        fundingResult = `External faucet completed: ${successfulFunds.length} successful, ${failedFunds.length} failed`;
      } else {
        // Internal faucet logic (adapted from xlmFaucet.ts)
        const server = new Horizon.Server(this.horizonServer);
        if (!faucetSecretKey) {
          logger.error('FAUCET_SECRET_KEY is not set in environment variables');
          throw new TransactionAssetTransferError(
            'FAUCET_SECRET_KEY is not set'
          );
        }
        const faucetKeypair = Keypair.fromSecret(faucetSecretKey);
        const faucetAccount = await server.loadAccount(
          faucetKeypair.publicKey()
        );
        let txBuilder = new TransactionBuilder(faucetAccount, {
          fee: (await server.fetchBaseFee()).toString(),
          networkPassphrase:
            sorobanServer === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
        }).setTimeout(TimeoutInfinite);
        // Only create accounts that do not exist
        const accountsToCreate: IBeneficiaryWallet[] = [];
        for (const k of keys) {
          const exists = await checkAccountExists(
            k.address,
            this.horizonServer
          );
          if (!exists) {
            accountsToCreate.push(k);
          }
        }
        if (accountsToCreate.length === 0) {
          logger.info('All accounts already exist');
          fundingResult = 'All accounts already exist';
          successfulKeys = keys; // All keys are successful for existing accounts
        } else {
          for (const k of accountsToCreate) {
            logger.info(`Creating account ${k.address}`);
            txBuilder = txBuilder.addOperation(
              Operation.createAccount({
                destination: k.address,
                startingBalance: amount,
              })
            );
          }
          const tx = txBuilder.build();
          tx.sign(faucetKeypair);
          const txnResult = await server.submitTransaction(tx);
          logger.info(
            `Accounts created or funded successfully: ${txnResult.hash}`
          );
          fundingResult = txnResult.hash;
          successfulKeys = keys; // All keys are successful for internal faucet
        }
      }

      return {
        message: `Funded successfully for ${keys.length} wallets: ${
          faucetType === 'internal' ? fundingResult : 'external faucet'
        }`,
        successfulKeys, // Return successful keys for trustline addition
      };
    } catch (error: any) {
      throw new TransactionAssetTransferError(
        `Failed to fund accounts: ${error.message}`
      );
    }
  }

  public async addTrustlines(
    keys: IBeneficiaryWallet[],
    sorobanServer: string
  ): Promise<IBatchFundResult> {
    await this.authService.getToken();
    try {
      logger.info(`Adding trustlines for ${keys.length} beneficiaries...`);

      const results = await Promise.all(
        keys.map(async (k) => {
          try {
            await addTrustline(
              k.address,
              k.secret,
              this.getAssetIssuer(),
              this.getAssetCode(),
              this.horizonServer,
              sorobanServer === 'mainnet' ? 'mainnet' : 'testnet'
            );
            logger.info(`Trustline added successfully for ${k.address}`);
            return { address: k.address, success: true };
          } catch (error: any) {
            logger.error(
              `Failed to add trustline for ${k.address}: ${error.message}`
            );
            return { address: k.address, success: false, error: error.message };
          }
        })
      );

      const successfulTrustlines = results.filter((r) => r.success);
      const failedTrustlines = results.filter((r) => !r.success);

      logger.info(
        `Trustline results: ${successfulTrustlines.length} successful, ${failedTrustlines.length} failed`
      );
      if (failedTrustlines.length > 0) {
        logger.warn('Some trustlines failed:', failedTrustlines);
      }

      return {
        message: `Trustlines added: ${successfulTrustlines.length} successful, ${failedTrustlines.length} failed`,
      };
    } catch (error: any) {
      throw new TransactionAssetTransferError(
        `Failed to add trustlines: ${error.message}`
      );
    }
  }

  // Keep the old method for backward compatibility, but it now only calls fundAccounts
  public async batchFundAccountXlm(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType: 'internal' | 'external' = 'internal'
  ): Promise<IBatchFundResult> {
    await this.authService.getToken();
    try {
      return this.fundAccounts(
        keys,
        amount,
        faucetSecretKey,
        sorobanServer,
        faucetBaseUrl,
        faucetAuthKey,
        faucetType
      );
    } catch (error: any) {
      throw new TransactionAssetTransferError(
        `Failed to fund accounts: ${error.message}`
      );
    }
  }

  public async sendAsset(
    senderSk: string,
    receiverPk: string,
    amount: string
  ): Promise<ISendAssetResult> {
    try {
      const asset = new Asset(this.assetCode, this.assetIssuer);
      const server = new Horizon.Server(this.horizonServer);
      const senderKeypair = Keypair.fromSecret(senderSk);
      const senderAccount = await server.loadAccount(senderKeypair.publicKey());
      console.log(`Sender account loaded: ${senderAccount.accountId}`);

      const transaction = new TransactionBuilder(senderAccount, {
        fee: (await server.fetchBaseFee()).toString(),
        networkPassphrase:
          this.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
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

      const tx = await server.submitTransaction(transaction);
      return { success: 'tokens sent', tx };
    } catch (error: any) {
      console.log(error.response?.data?.extras || error);
      throw new TransactionError(`Failed to send asset: ${error.message}`);
    }
  }

  public async getAccountBalance(wallet: string): Promise<IAccountBalance[]> {
    try {
      console.log(
        `[TransactionApiService] Fetching balances for account: ${wallet} on Horizon: ${this.horizonServer}`
      );
      const server = new Horizon.Server(this.horizonServer);
      const account = await server.accounts().accountId(wallet).call();
      return account.balances;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        throw new AccountNotFoundError(wallet);
      }
      throw new TransactionError(
        `Failed to get account balance: ${error.message}`
      );
    }
  }

  public async checkAccountExists(wallet: string): Promise<boolean> {
    // Use Horizon directly instead of axios API call
    try {
      // Log for debugging
      console.log(
        `[TransactionApiService] Checking account: ${wallet} on Horizon: ${this.horizonServer}`
      );
      const server = new Horizon.Server(this.horizonServer);
      await server.accounts().accountId(wallet).call();
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw new TransactionError(
        `Failed to check account existence: ${error.message}`
      );
    }
  }

  public async getAssetInfo(): Promise<string> {
    await this.authService.getToken();
    try {
      const response = await this.axiosInstance.get(API_ROUTES.STELLAR.ASSET);
      const asset = response.data[0];
      return `${asset.code}:${asset.issuer}`;
    } catch (error: any) {
      throw new TransactionError(`Failed to get asset info: ${error.message}`);
    }
  }

  private async waitForTransactionConfirmation(
    transactionHash: string
  ): Promise<any> {
    const startTime = Date.now();
    const timeoutMs = 60000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await this.axiosInstance.get(
          `${API_ROUTES.STELLAR.ASSET}/transactions/${transactionHash}`
        );

        const txResponse = response.data;
        if (txResponse.successful) {
          return txResponse;
        } else {
          throw new TransactionConfirmationError(
            transactionHash,
            txResponse.result_xdr
          );
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Transaction not found yet, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else if (error instanceof TransactionConfirmationError) {
          throw error;
        } else {
          throw new TransactionConfirmationError(
            transactionHash,
            error.message
          );
        }
      }
    }

    throw new TransactionConfirmationError(
      transactionHash,
      `Transaction confirmation timed out after ${timeoutMs}ms`
    );
  }

  // Helper for polling external faucet status
  private async pollFaucetStatus(
    baseUrl: string,
    faucetId: string,
    apiKey: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<string> {
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
  }

  // Helper methods to get asset info (you'll need to implement these based on your config)
  private getAssetIssuer(): string {
    return this.assetIssuer;
  }

  private getAssetCode(): string {
    return this.assetCode;
  }
}
