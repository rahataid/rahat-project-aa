import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBeneficiaryOtpDto {
  constructor() {
    this.beneficiaryWalletAddress = '';
    this.otp = '';
    this.otpHash = '';
  }

  @IsString()
  @IsNotEmpty()
  beneficiaryWalletAddress: string;

  @IsString()
  @IsNotEmpty()
  otp: string;

  @IsString()
  @IsNotEmpty()
  otpHash: string;
}

export class GetBeneficiaryOtpDto {
  constructor() {
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;
}
