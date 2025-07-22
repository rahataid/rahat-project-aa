export interface ITransaction {
  asset: string;
  created_at: string;
  hash: string;
  amount: string;
  source: string;
  amtColor: 'red' | 'green' | 'blue';
}

export interface ITransactionResult {
  message: string;
}

export interface ISendAssetResult {
  success: string;
  tx: any;
}

export interface IAccountBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
}

export interface IBeneficiaryWallet {
  address: string;
  secret: string;
}

export interface IBatchFundResult {
  message: string;
  successfulKeys?: IBeneficiaryWallet[];
}

export interface ITransactionService {
  getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ): Promise<ITransaction[]>;
  hasTrustline(publicKey: string): Promise<boolean>;
  rahatFaucetService(
    walletAddress: string,
    amount: string
  ): Promise<ITransactionResult>;
  fundAccounts(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType?: 'internal' | 'external'
  ): Promise<IBatchFundResult>;
  addTrustlines(
    keys: IBeneficiaryWallet[],
    sorobanServer: string
  ): Promise<IBatchFundResult>;
  batchFundAccountXlm(
    keys: IBeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType?: 'internal' | 'external'
  ): Promise<IBatchFundResult>;
  sendAsset(
    senderSk: string,
    receiverPk: string,
    amount: string
  ): Promise<ISendAssetResult>;
  getAccountBalance(wallet: string): Promise<IAccountBalance[]>;
  checkAccountExists(wallet: string): Promise<boolean>;
  getAssetInfo(): Promise<string>;
}
