import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ListPayoutDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  perPage?: number;

  @IsOptional()
  @IsString()
  payoutType?: string;

  @IsOptional()
  @IsString()
  groupName?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
