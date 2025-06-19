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
  payoutUUID: string;
  payoutProcessorId: string;
  beneficiaryRedeemUUID?: string;
  amount: number;
}

export interface FSPOfframpDetails extends FSPPayoutDetails {
  transactionHash: string;
}