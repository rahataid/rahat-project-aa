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

export interface IReceiveService {
  // createReceiverAccount(): Promise<any>;
  // sendOTP(
  //   tenantName: string,
  //   receiverPublicKey: string,
  //   phoneNumber: string
  // ): Promise<any>;
  // verifyOTP(
  //   auth: string,
  //   phoneNumber: string,
  //   otp: string,
  //   verification: string
  // ): Promise<any>;
  sendAsset(senderSk: string, receiverPk: string, amount: string): Promise<any>;
  getAccountBalance(wallet: string): Promise<any>;
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
}

export interface ICreateTenantService {
  createTenant(): Promise<any>;
}

export type BeneficiaryWallet = {
  address: string;
  secret: string;
};
