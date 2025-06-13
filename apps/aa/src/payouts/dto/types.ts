enum OfframpStatus {
  PENDING, //Initial Statei
  PROCESSING, // while the request is being processed (eg. waiting for tx response from cips)
  FAILED, // request failed for some reason  - retry logic can be implemented
  CANCELLED, // request is cancelled and should not be processed
  REJECTED, // request failed with validation issues i.e cannot be processed
  SUCCESS // when the offramp is completed successfully
}

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
  responseCode: string;
  responseMessage: string;
  id: string;
  appId: string;
  tokenAmount: string;
  status: OfframpStatus;
  paymentProviderId: string;
  senderAddress: string;
  transactionHash: string;
  fiatAmount: number;
  paymentDetails: PaymentDetails;
}

export interface CipsFailedTransactionResponse {
  responseCode: string;
  responseMessage: string;
  data: null;
  classfielderrorlist: any[];
}

export interface CipsSuccessTransactionResponse {
  responseCode: string;
  responseMessage: string;
  id: number;
  instructionId: string;
  creditStatus: string;
}

export interface CipsResponseData {
  offrampRequest: OfframpRequest;
  // if the transaction is successful, the transaction will be a CipsSuccessTransactionResponse
  // if the transaction is failed, the transaction will be a CipsFailedTransactionResponse  
  transaction: CipsSuccessTransactionResponse | CipsFailedTransactionResponse;
}

export interface CipsApiResponse {
  success: boolean;
  data: CipsResponseData;
} 

/*

offrampRequest: {
  id: '765737d7-ac5e-4084-bef1-752eb6fa4cda',
  appId: 'f3af9d3a-3e6e-4542-b768-d9758a4fe750',
  tokenAmount: '1',
  status: 'FAILED',
  paymentProviderId: '8e7971fe-590c-425f-a02b-3c43eaf7f9a2',
  senderAddress: 'GB5J4MPEKALMAJEN2JO6HL4XXAZ4CSUDKJNP5DJ7US2QCQ3WWR5OGL2V',
  transactionHash: '78efb88abcb414e9f69b17759f8143ce383d28895931705aa3ad26eb674c6729',
  fiatAmount: null,
  paymentDetails: {
    amount: 1,
    endToEndId: 'Payment Description',
    creditorName: 'Manisha Dhaubanzar',
    creditorAgent: '0401',
    creditorBranch: '81',
    creditorAccount: '08110017501011'
  },
  xref: null,
  createdAt: '2025-06-13T06:58:06.812Z',
  updatedAt: '2025-06-13T06:58:07.714Z'
}

transaction: {
  responseCode: 'E999',
  responseMessage: 'ERROR',
  data: null,
  classfielderrorlist: []
}

*/