import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserObject } from './inkind.dto';
import { PayoutMode } from '@prisma/client';

export class ListGroupInkindDto {
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
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsEnum(PayoutMode)
  mode?: PayoutMode;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  inkindType?: string;
}

export class AssignGroupInkindDto {
  @IsUUID()
  inkindId: string;

  @IsUUID()
  groupId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsObject()
  user: UserObject;

  @IsEnum(PayoutMode)
  @IsNotEmpty()
  mode: PayoutMode;

  @IsOptional()
  @IsUUID()
  payoutProcessorId?: string;
}
