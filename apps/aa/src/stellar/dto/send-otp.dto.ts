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
  trigger_type: string;
  phase: string;
  title: string;
  source: string;
  river_basin: string;
  params: JSON;
  is_mandatory: boolean;
}
