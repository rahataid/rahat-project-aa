export type OfframpStatus = 'PENDING' | 'PROCESSING' | 'FAILED' | 'CANCELLED' | 'REJECTED' | 'SUCCESS';

export interface IPaymentProvider {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export type bankDetails = {
  accountName: string;
  accountNumber: string;
  bankName: string;
}

export interface BeneficiaryPayoutDetails {
  walletAddress: string;
  amount: number;
  bankDetails: bankDetails;
}

export interface PaymentDetails {
  amount: number;
  endToEndId: string;
  creditorName: string;
  creditorAgent: string;
  creditorBranch: string;
  creditorAccount: string;
}

export interface OfframpRequest {
  id: string;
  appId: string;
  tokenAmount: string;
  status: OfframpStatus;
  paymentProviderId: string;
  senderAddress: string;
  transactionHash: string;
  fiatAmount: number;
  paymentDetails: PaymentDetails;
  xref: string;
  createdAt: string;
  updatedAt: string;
}

export interface CipsFailedTransactionResponse {
  responseCode: string;
  responseMessage: string;
  data: null;
  classfielderrorlist: any[];
}

export interface CipsTxnResponse {
  id: number;
  creditStatus: string;
  responseCode: string;
  instructionId: string;
  responseMessage: string;
}

export interface CipsTransactionResponse {
  cipsBatchResponse: {
    responseCode: string;
    responseMessage: string;
    batchId: string;
    debitStatus: string;
    id: number;
  };
  cipsTxnResponseList: CipsTxnResponse[];
}

export interface CipsResponseData {
  offrampRequest: OfframpRequest;
  // if the transaction is successful, the transaction will be a CipsSuccessTransactionResponse
  // if the transaction is failed, the transaction will be a CipsFailedTransactionResponse  
  transaction: CipsTransactionResponse;
}

export interface CipsApiResponse {
  success: boolean;
  data: CipsResponseData;
} 