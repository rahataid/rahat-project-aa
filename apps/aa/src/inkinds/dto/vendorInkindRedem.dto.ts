import { RedemptionStatus } from '@prisma/client';
import { Type } from 'class-transformer/types/decorators/type.decorator';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { UserObject } from './inkind.dto';

export class GetVendorInkindRedemptionDto {
  @IsString()
  @IsOptional()
  vendorUuid?: string;

  @IsString()
  @IsOptional()
  status?: RedemptionStatus;

  @IsString()
  @IsOptional()
  vendorName?: string;

  @IsString()
  @IsOptional()
  inkindName?: string;

  @IsString()
  @IsOptional()
  inkindType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  perPage?: number = 10;

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc' = 'asc';
}

export class AddVendorInkindRedeemDto {
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  inkindUuid: string;

  @IsString()
  vendorUuid: string;
}

export class UpdateVendorInkindRedeemStatusDto {
  @IsString()
  uuid: string;

  @IsString()
  status: RedemptionStatus;

  @IsObject()
  user: UserObject;
}
