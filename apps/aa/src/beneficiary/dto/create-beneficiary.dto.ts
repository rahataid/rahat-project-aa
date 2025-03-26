import { UUID } from 'crypto';

export class CreateBeneficiaryDto {
  uuid: UUID;
  walletAddress?: string;
  extras?: any;
  isVerified?: boolean;
}

export interface AddBeneficiaryGroups {
  name: string;
  beneficiaries: Array<{
    uuid: string;
  }>
}

export interface AddTokenToGroup {
  beneficiaryGroupId: string;
  numberOfTokens: number;
  totalTokensReserved: number;
  title: string;
  user?: any;
}

export interface AssignBenfGroupToProject {
  beneficiaryGroupData: {
    id: number;
    uuid: string;
    name: string;
  }
}
