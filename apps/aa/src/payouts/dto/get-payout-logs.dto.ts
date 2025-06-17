import { PayoutTransactionStatus, PayoutTransactionType } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetPayoutLogsDto {
  @IsString()
  payoutUUID: string;

  @IsEnum(PayoutTransactionType)
  @IsOptional()
  transactionType?: PayoutTransactionType;

  @IsEnum(PayoutTransactionStatus)
  @IsOptional()
  transactionStatus?: PayoutTransactionStatus;

  @ApiProperty({
    example: 1,
    description: 'page number',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({
    example: 10,
    description: 'number of items per page',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  perPage?: number = 100;

  @ApiProperty({
    example: 'createdAt',
    description: 'Sort field',
    required: false,
  })
  @IsOptional()
  @IsString()
  sort: string;

  @ApiProperty({
    example: 'desc',
    description: 'Sort order',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsString()
  search?: string;
} 