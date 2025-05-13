import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PayoutType } from '@prisma/client';

export class CreateBeneficiaryRedeemDto {
  @IsString()
  @IsNotEmpty()
  beneficiaryWalletAddress: string = '';

  @IsBoolean()
  @IsOptional()
  hasRedeemed?: boolean = false;

  @IsEnum(PayoutType)
  @IsNotEmpty()
  transactionType: PayoutType = PayoutType.FSP;

  @IsUUID()
  @IsOptional()
  vendorUid?: string;

  @IsString()
  @IsOptional()
  fspId?: string;
}

export class GetBeneficiaryRedeemDto {
  constructor() {
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;
}
