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

export interface CipsBatchResponse {
  responseCode: string;
  responseMessage: string;
  batchId: string;
  debitStatus: string;
  id: number;
}

export interface CipsTransactionResponse {
  responseCode: string;
  responseMessage: string;
  id: number;
  instructionId: string;
  creditStatus: string;
}

export interface CipsResponseData {
  cipsBatchResponse: CipsBatchResponse;
  cipsTxnResponseList: CipsTransactionResponse[];
}

export interface CipsApiResponse {
  success: boolean;
  data: CipsResponseData;
} 