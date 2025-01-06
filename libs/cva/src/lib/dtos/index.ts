import { IsNumber, IsOptional, IsString } from 'class-validator';

export * from './beneficiary';
export * from './vendor';

export class PaginationBaseDto {
  @IsString()
  @IsOptional()
  sort!: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  order!: 'asc' | 'desc';

  @IsNumber()
  page!: number;

  @IsNumber()
  perPage!: number;
}
