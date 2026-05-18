import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { UserObject } from './inkind.dto';
import { PayoutMode } from '@prisma/client';

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
