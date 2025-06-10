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
}

export interface OfframpRequest extends FSPPayoutDetails {
  transactionHash: string;
  amount: string;
}