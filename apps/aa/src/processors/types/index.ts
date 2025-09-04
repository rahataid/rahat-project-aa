import { IDisbursementResultDto } from '../../stellar/dto/disburse.dto';

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

export interface FSPOfframpDetails extends FSPPayoutDetails {
  transactionHash: string;
}

export * from './batch-transfer.dto';
