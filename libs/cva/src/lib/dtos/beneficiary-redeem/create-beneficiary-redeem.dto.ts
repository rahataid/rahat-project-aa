import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateBeneficiaryRedeemDto {
  constructor() {
    this.beneficiaryWalletAddress = '';
    this.vendorId = '';
    this.hasRedeemed = false;
  }

  @IsString()
  @IsNotEmpty()
  beneficiaryWalletAddress: string;

  @IsString()
  @IsNotEmpty()
  vendorId: string;

  @IsBoolean()
  hasRedeemed: boolean;
}

export class GetBeneficiaryRedeemDto {
  constructor() {
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;
}
