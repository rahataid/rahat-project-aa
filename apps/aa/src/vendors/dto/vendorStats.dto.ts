import { IsNumber, IsOptional, IsString } from 'class-validator';

export class VendorStatsDto {
  @IsString()
  @IsOptional()
  uuid?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  take?: number;

  @IsNumber()
  @IsOptional()
  skip?: number;
}
