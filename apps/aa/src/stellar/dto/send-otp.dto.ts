import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator';

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
  @IsString()
  id: string;

  @IsString()
  trigger_type: string;

  @IsString()
  phase: string;

  @IsString()
  title: string;

  @IsString()
  source: string;

  @IsString()
  river_basin: string;

  @IsJSON()
  params: JSON;

  @IsBoolean()
  is_mandatory: boolean;
}
