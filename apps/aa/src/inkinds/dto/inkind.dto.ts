import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsUUID,
  Min,
  IsIn,
  IsArray,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InkindType {
  WALK_IN = 'WALK_IN',
  PRE_DEFINED = 'PRE_DEFINED',
}

export enum InkindTxStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface UserObject {
  id: number;
  userId: number;
  uuid: string;
  name: string;
  email: string;
  phone: string | null;
  wallet: string;
}

export class CreateInkindDto {
  @IsString()
  name: string;

  @IsEnum(InkindType)
  type: InkindType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}

export class UpdateInkindDto {
  @IsUUID()
  uuid: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(InkindType)
  type?: InkindType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image?: string;
}

export class GetInkindDto {
  @IsUUID()
  uuid: string;
}

export class DeleteInkindDto {
  @IsUUID()
  uuid: string;
}

export class ListInkindDto {
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  perPage?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'name', 'type', 'availableStock'])
  sort?: 'createdAt' | 'name' | 'type' | 'availableStock' = 'createdAt';

  @IsOptional()
  @IsEnum(InkindType)
  type?: InkindType;

  @IsOptional()
  @IsString()
  name?: string;
}

export class BeneficiaryInkindRedeemDto {
  @IsString()
  walletAddress: string;

  @IsArray()
  inkinds: {
    uuid: string;
    groupInkindUuid?: string;
  }[];

  @IsObject()
  user: UserObject;
}

export class GetGroupInkindLogsDto {
  @IsString()
  groupInkindId: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  perPage?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['redeemedAt', 'quantity'])
  sort?: 'redeemedAt' | 'quantity' = 'redeemedAt';
}

export class GetVendorInkindLogsDto {
  @IsString()
  vendorId: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  perPage?: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['redeemedAt', 'quantity'])
  sort?: 'redeemedAt' | 'quantity' = 'redeemedAt';
}
