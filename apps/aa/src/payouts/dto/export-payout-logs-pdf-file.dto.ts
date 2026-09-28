import { PayoutTransactionStatus, PayoutTransactionType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Single DTO for the server-side CVA payout logs PDF download (table only).
 * Carries just the payout identity plus the log-list filters respected in
 * the export. The API renders the PDF and returns it as base64.
 */
export class ExportPayoutLogsPdfFileDto {
  @ApiProperty({
    description: 'Payout UUID to export logs for',
  })
  @IsUUID()
  payoutUUID: string;

  @ApiProperty({ required: false })
  @IsEnum(PayoutTransactionType)
  @IsOptional()
  transactionType?: PayoutTransactionType;

  @ApiProperty({ required: false })
  @IsEnum(PayoutTransactionStatus)
  @IsOptional()
  transactionStatus?: PayoutTransactionStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
