import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export enum TokenRedemptionStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export class CreateVendorTokenRedemptionDto {
  @IsUUID()
  @IsNotEmpty()
  vendorUuid: string;

  @IsNumber()
  @IsNotEmpty()
  tokenAmount: number;

  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateVendorTokenRedemptionDto {
  @IsUUID()
  @IsNotEmpty()
  uuid: string;

  @IsEnum(TokenRedemptionStatus)
  @IsNotEmpty()
  redemptionStatus: TokenRedemptionStatus;

  @IsString()
  @IsOptional()
  approvedBy?: string;

  @IsString()
  @IsOptional()
  transactionHash?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class GetVendorTokenRedemptionDto {
  @IsUUID()
  @IsNotEmpty()
  uuid: string;
}

export class ListVendorTokenRedemptionDto {
  @IsUUID()
  @IsOptional()
  vendorUuid?: string;

  @IsEnum(TokenRedemptionStatus)
  @IsOptional()
  redemptionStatus?: TokenRedemptionStatus;

  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  perPage?: number = 20;
}
