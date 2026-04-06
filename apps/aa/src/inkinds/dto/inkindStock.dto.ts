import { InkindStockMovementType } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddInkindStockDto {
  @IsUUID()
  inkindId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsUUID()
  @IsOptional()
  groupInkindId?: string;

  @IsUUID()
  @IsOptional()
  redemptionId?: string;
}

export class RemoveInkindStockDto {
  @IsUUID()
  inkindUuid: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class ListStockMovementsDto {
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
  @IsEnum(InkindStockMovementType)
  type?: InkindStockMovementType;
}
