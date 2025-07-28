import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { PayoutTransactionStatus, PayoutTransactionType } from '@prisma/client';

export class GetPayoutDetailsDto {
  @IsUUID()
  uuid: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @IsEnum(PayoutTransactionStatus)
  status?: PayoutTransactionStatus;

  @IsOptional()
  @IsEnum(PayoutTransactionType)
  transactionType?: PayoutTransactionType;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  perPage?: number;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';
}

export interface PayoutDetailsResponse {
  beneficiaryWalletAddress: string;
  transactionWalletId: string;
  transactionType: string;
  tokensAssigned: number;
  payoutStatus: string;
  timestamp: Date;
  txHash?: string;
}
