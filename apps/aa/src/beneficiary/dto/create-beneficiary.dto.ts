import { UUID } from 'crypto';

export class CreateBeneficiaryDto {
  uuid: UUID;
  walletAddress?: string;
  extras?: any;
}
