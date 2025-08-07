import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExecuteActionRequestDto {
  @IsString()
  from: string; // smart address

  @IsString()
  to: string; // smart address

  @IsString()
  alias: string;

  @IsEnum(['create_budget', 'initiate_transfer', 'confirm_transfer', 'approve', 'allowance', 'transfer'])
  action: 'create_budget' | 'initiate_transfer' | 'confirm_transfer' | 'approve' | 'allowance' | 'transfer';

  @IsString()
  amount: string | number | bigint;

  @IsOptional()
  @IsString()
  proof?: string; // Base64 encoded proof document

  @IsOptional()
  @IsString()
  description?: string;
}
