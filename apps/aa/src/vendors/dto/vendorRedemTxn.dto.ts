import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class VendorRedeemTxnListDto {
  @IsString()
  @ApiProperty({ description: 'Vendor uuid' })
  uuid: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to fetch' })
  page?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to skip' })
  perPage?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Transaction hash' })
  txHash?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Status filter for redemption requests',
    example: 'success',
  })
  status?: string;
}
