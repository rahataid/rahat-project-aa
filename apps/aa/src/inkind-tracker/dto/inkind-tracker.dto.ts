import { IsString, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ExecuteActionRequestDto {
  @IsString()
  from: string; // smart address

  @IsOptional()
  @IsString()
  to?: string; // smart address (optional for balance checks)

  @IsString()
  alias: string;

  @IsIn([
    'create_budget',
    'initiate_transfer',
    'confirm_transfer',
    'approve',
    'allowance',
    'transfer',
    'get_cash_balance',
    'get_cash_from',
    'get_cash_approved_by_me',
    'give_cash_allowance',
  ])
  action:
    | 'create_budget'
    | 'initiate_transfer'
    | 'confirm_transfer'
    | 'approve'
    | 'allowance'
    | 'transfer'
    | 'get_cash_balance'
    | 'get_cash_from'
    | 'get_cash_approved_by_me'
    | 'give_cash_allowance';

  @IsOptional()
  @IsString()
  amount?: string | number | bigint;

  @IsOptional()
  @IsString()
  proof?: string; // Base64 encoded proof document

  @IsOptional()
  @IsString()
  description?: string;
}
