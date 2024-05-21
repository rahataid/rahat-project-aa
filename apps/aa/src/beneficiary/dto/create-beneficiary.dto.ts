import { UUID } from 'crypto';

export class CreateBeneficiaryDto {
  uuid: UUID;
  walletAddress?: string;
  extras?: any;
}

export interface AddBeneficiaryGroups{
  name: string;
  beneficiaries: Array<{
    uuid: string;
  }>
}

export interface AddTokenToGroup{
  uuid: string;
  tokens: number;
}
