import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { RequiredAndOptionalKeys } from '../common';

interface IBeneficiary {
  uuid: string;
  walletAddress: string;
  extras?: Record<string, any>;
}

export type CreateBeneficiaryDto = RequiredAndOptionalKeys<
  IBeneficiary,
  'uuid' | 'walletAddress'
>;

export class GetBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;

  @IsObject()
  data?: Record<string, any>;
}
