export interface IDisbursementService {
  createDisbursementProcess(
    disbursementName: string,
    fileBuffer: Buffer,
    fileName: string,
    amount: string
  ): Promise<any>;
  getDistributionAddress(tenantName: string): Promise<any>;
}

export interface IDisbursement {
  id: string;
  name: string;
  status_history: {
    user_id: string;
    status: string;
    timestamp: string;
  }[];
  amount_disbursed: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ITransactionService {
  getTransaction(
    pk: string,
    limit: number,
    order: 'asc' | 'desc'
  ): Promise<any>;
  hasTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string
  ): Promise<boolean>;
  rahatFaucetService(walletAddress: string, amount: string): Promise<any>;
  batchFundAccountXlm(
    keys: BeneficiaryWallet[],
    amount: string,
    faucetSecretKey: string,
    sorobanServer: string,
    faucetBaseUrl?: string,
    faucetAuthKey?: string,
    faucetType?: 'internal' | 'external'
  ): Promise<any>;
  sendAsset(senderSk: string, receiverPk: string, amount: string): Promise<any>;
  getAccountBalance(wallet: string): Promise<any>;
  checkAccountExists(wallet: string): Promise<boolean>;
  getAssetInfo(): Promise<string>;
}

export type BeneficiaryWallet = {
  address: string;
  secret: string;
};
