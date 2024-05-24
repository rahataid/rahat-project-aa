import { UUID } from 'crypto';

export class CreateBeneficiaryDto {
  uuid: UUID;
  walletAddress?: string;
  extras?: any;
}

export interface AddBeneficiaryGroups {
  name: string;
  beneficiaries: Array<{
    uuid: string;
  }>
}

export interface AddTokenToGroup {
  uuid: string;
  tokens: number;
}

export interface AssignBenfGroupToProject {
  beneficiaryGroupData: {
    id: number;
    uuid: string;
    name: string;
  }
}
