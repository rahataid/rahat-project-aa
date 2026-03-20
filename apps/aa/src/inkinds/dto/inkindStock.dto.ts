import { InkindStockMovementType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

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
