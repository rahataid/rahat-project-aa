import { IsOptional } from 'class-validator';

export class SendOtpDto {
  phoneNumber: string;

  @IsOptional()
  amount: string;
}

export class SendAssetDto {
  amount: string | number;
  phoneNumber: string;
  receiverAddress: string;
  otp: string;
}

export class FundAccountDto {
  walletAddress: string;
  secretKey: string;
}

export class AddTriggerDto {
  id: string;
}
