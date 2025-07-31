import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsBoolean,
  IsEnum,
} from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({
    description: 'Bank username',
    example: 'custom_user',
  })
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Bank password',
    example: 'custom_pass',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'TOTP code for authentication',
    example: '123456',
  })
  @IsString()
  totp: string;
}

export class TransactionRequestDto {
  @ApiProperty({
    description: 'Bank account number',
    example: '1234567890',
  })
  @IsString()
  accountNumber: string;

  @ApiProperty({
    description: 'Bank username',
    example: 'custom_user',
  })
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Bank password',
    example: 'custom_pass',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: 'TOTP secret for authentication',
    example: '123456',
  })
  @IsString()
  totpSecret: string;

  @ApiProperty({
    description: 'Start date for transaction range (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsString()
  fromDate: string;

  @ApiProperty({
    description: 'End date for transaction range (YYYY-MM-DD)',
    example: '2024-01-31',
  })
  @IsString()
  toDate: string;

  @ApiProperty({
    description: 'Type of transactions to retrieve',
    enum: ['ALL', 'DEBIT', 'CREDIT'],
    example: 'ALL',
  })
  @IsEnum(['ALL', 'DEBIT', 'CREDIT'])
  transactionType: 'ALL' | 'DEBIT' | 'CREDIT';
}

export class BankAutomationResponse {
  @ApiProperty({
    description: 'Success status of the operation',
    example: true,
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'Response data from the bank automation',
    required: false,
  })
  @IsOptional()
  data?: any;

  @ApiProperty({
    description: 'Success message',
    required: false,
    example: 'Successfully retrieved bank data',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({
    description: 'Error message if operation failed',
    required: false,
    example: 'Invalid credentials',
  })
  @IsOptional()
  @IsString()
  error?: string;
}
