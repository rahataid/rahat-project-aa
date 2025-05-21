import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator';

export class SendOtpDto {
  phoneNumber: string;

  @IsOptional()
  amount: string;
}

export class SendGroupDto {
  groupUuid: string;
  vendorUuid: string;
}

export class SendAssetDto {
  amount: string | number;
  phoneNumber: string;
  receiverAddress: string;
  otp: string;
}

export class SendAssetDtoWithAddress {
  amount: string | number;
  senderAddress: string;
  receiverAddress: string;
  otp: string;
}

export class FundAccountDto {
  walletAddress: string;

  @IsOptional()
  secretKey?: string;
}

export class CheckTrustlineDto {
  walletAddress: string;
}
