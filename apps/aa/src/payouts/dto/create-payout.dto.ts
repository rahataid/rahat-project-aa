import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PayoutType, PayoutMode } from '@prisma/client';

export class CreatePayoutDto {
  @IsEnum(PayoutType)
  @IsNotEmpty()
  type: PayoutType;

  @IsEnum(PayoutMode)
  @IsNotEmpty()
  mode: PayoutMode;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  extras?: any;

  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsString()
  @IsOptional()
  payoutProcessorId?: string;

  @IsOptional()
  user?: any;
}
