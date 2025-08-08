import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PayoutMode } from '@prisma/client';

export class VendorBeneficiariesDto {
  @IsString()
  @ApiProperty({ description: 'Vendor UUID' })
  vendorUuid: string;

  @IsEnum(PayoutMode)
  @ApiProperty({
    description: 'Payout mode - ONLINE or OFFLINE',
    enum: PayoutMode,
    example: PayoutMode.ONLINE,
  })
  payoutMode: PayoutMode;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Page number for pagination',
    required: false,
    default: 1,
  })
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    default: 20,
  })
  perPage?: number = 20;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Wallet address to search for (optional)',
    required: false,
    example: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  })
  walletAddress?: string;
}
