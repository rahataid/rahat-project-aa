import { IsNumber, IsOptional, IsString } from 'class-validator';

export * from './beneficiary';
export * from './vendor';

export type RequiredAndOptionalKeys<T, R extends keyof T> = {
  [K in R]: T[K]; // Required fields
} & Partial<Omit<T, R>>; // All other fields are optional

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
