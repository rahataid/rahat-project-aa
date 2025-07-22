import { AuthService } from '../auth.service';
import { TransactionApiService } from './transaction-api.service';
import {
  ITransaction,
  ITransactionResult,
  ISendAssetResult,
  IAccountBalance,
  IBeneficiaryWallet,
  IBatchFundResult,
  ITransactionService,
} from '../../core/interfaces/transaction.interface';

export class TransactionService implements ITransactionService {
  private readonly transactionApiService: TransactionApiService;

  constructor(
    authService: AuthService,
    assetIssuer: string,
    assetCode: string,
    assetSecret: string,
    horizonServer: string,
    network: string
  ) {
    this.transactionApiService = new TransactionApiService(
      authService,
      assetIssuer,
      assetCode,
      assetSecret,
      horizonServer,
      network
    );
  }

  public async getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ): Promise<ITransaction[]> {
    return this.transactionApiService.getTransaction(pk, limit, order);
  }

  public async hasTrustline(publicKey: string): Promise<boolean> {
    return this.transactionApiService.hasTrustline(publicKey);
  }

  public async rahatFaucetService(
    walletAddress: string,
    amount: string
  ): Promise<ITransactionResult> {
    return this.transactionApiService.rahatFaucetService(walletAddress, amount);
  }

  public async batchFundAccountXlm(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType?: 'internal' | 'external'
  ): Promise<IBatchFundResult> {
    return this.transactionApiService.batchFundAccountXlm(
      keys,
      amount,
      faucetSecretKey,
      sorobanServer,
      faucetBaseUrl,
      faucetAuthKey,
      faucetType
    );
  }

  public async fundAccounts(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType?: 'internal' | 'external'
  ): Promise<IBatchFundResult> {
    return this.transactionApiService.fundAccounts(
      keys,
      amount,
      faucetSecretKey,
      sorobanServer,
      faucetBaseUrl,
      faucetAuthKey,
      faucetType
    );
  }

  public async addTrustlines(
    keys: IBeneficiaryWallet[],
    sorobanServer: string
  ): Promise<IBatchFundResult> {
    return this.transactionApiService.addTrustlines(keys, sorobanServer);
  }

  public async sendAsset(
    senderSk: string,
    receiverPk: string,
    amount: string
  ): Promise<ISendAssetResult> {
    return this.transactionApiService.sendAsset(senderSk, receiverPk, amount);
  }

  public async getAccountBalance(wallet: string): Promise<IAccountBalance[]> {
    return this.transactionApiService.getAccountBalance(wallet);
  }

  public async checkAccountExists(wallet: string): Promise<boolean> {
    return this.transactionApiService.checkAccountExists(wallet);
  }

  public async getAssetInfo(): Promise<string> {
    return this.transactionApiService.getAssetInfo();
  }
}
