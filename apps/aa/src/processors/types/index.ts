import { IDisbursementResultDto } from "../../stellar/dto/disburse.dto";

export interface IDisbursementStatusJob extends IDisbursementResultDto {
  groupUuid: string;
}

export interface FSPPayoutDetails {
  offrampWalletAddress: string;
  beneficiaryWalletAddress: string;
  beneficiaryBankDetails: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  beneficiaryPhoneNumber?: string;
  payoutUUID: string;
  payoutProcessorId: string;
  offrampType: string;
  beneficiaryRedeemUUID?: string;
  amount: number;
}

export interface FSPManualPayoutDetails extends Omit<FSPPayoutDetails, 'offrampType' | 'offrampWalletAddress'> {}

export interface FSPOfframpDetails extends FSPPayoutDetails {
  transactionHash: string;
}