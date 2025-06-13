import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VendorStatsDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Vendor uuid' })
  uuid?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to fetch' })
  take?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to skip' })
  skip?: number;
}

export class VendorRedeemDto {
  @IsString()
  @ApiProperty({ description: 'Vendor uuid' })
  uuid: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to fetch' })
  take?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Number of transactions to skip' })
  skip?: number;
}
