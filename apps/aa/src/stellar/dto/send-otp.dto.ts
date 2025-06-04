import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  phoneNumber: string;

  @IsOptional()
  amount?: string;
}

export class SendGroupDto {
  vendorUuid: string;
}

export class SendAssetDto {
  amount: string | number;
  phoneNumber: string;
  receiverAddress: string;
  otp: string;
}

export class SendAssetByWalletAddressDto {
  amount: string | number;
  walletAddress: string;
  receiverAddress: string;
}

export class FundAccountDto {
  walletAddress: string;

  @IsOptional()
  secretKey?: string;
}

export class RahatFaucetDto {
  walletAddress: string;
  amount: string;
}

export class CheckTrustlineDto {
  walletAddress: string;
}
