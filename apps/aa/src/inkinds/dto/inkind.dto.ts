import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InkindType {
  WALK_IN = 'WALK_IN',
  PRE_DEFINED = 'PRE_DEFINED',
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
  order?: string = 'desc';

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
  sort?: string = 'createdAt';

  @IsOptional()
  @IsEnum(InkindType)
  type?: InkindType;

  @IsOptional()
  @IsString()
  name?: string;
}
