import { Beneficiary } from '@prisma/client';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { RequiredAndOptionalKeys } from '..';

export class GetBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;

  @IsObject()
  data?: any;
}

export type CreateBeneficiaryDto = RequiredAndOptionalKeys<
  Beneficiary,
  'uuid' | 'walletAddress'
>;
