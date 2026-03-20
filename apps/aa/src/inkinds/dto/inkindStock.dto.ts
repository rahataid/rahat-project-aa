import { InkindStockMovementType } from '@prisma/client';
import { IsEnum, IsNumber, IsUUID } from 'class-validator';

export class AddInkindStockDto {
  @IsUUID()
  inkindId: string;

  @IsNumber()
  quantity: number;

  // @IsEnum(InkindStockMovementType)
  // type?: InkindStockMovementType;

  @IsUUID()
  groupInkindId?: string;

  @IsUUID()
  redemptionId?: string;
}

export class RemoveInkindStockDto {
  @IsUUID()
  uuid: string;
}
