import { IDisbursementResultDto } from "../../stellar/dto/disburse.dto";

export interface IDisbursementStatusJob extends IDisbursementResultDto {
  groupUuid: string;
}

export interface OfframpTransfer {
  offrampWalletAddress: string;
  beneficiaryWalletAddress: string;
  payoutUUID: string;
}

export interface offrampRequest extends OfframpTransfer {
  transactionHash: string;
  amount: string;
}