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
  bankDetails: bankDetails;
}