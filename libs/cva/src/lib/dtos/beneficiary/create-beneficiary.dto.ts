import { Beneficiary } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { RequiredAndOptionalKeys } from '..';

export class GetBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;
}

export type CreateBeneficiaryDto = RequiredAndOptionalKeys<
  Beneficiary,
  'uuid' | 'walletAddress'
>;
