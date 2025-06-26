import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListGrievanceDto {
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'desc' | 'asc' = 'desc';

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  perPage: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'id'])
  sort: 'createdAt' | 'updatedAt' | 'id' = 'createdAt';

  @IsOptional()
  @IsString()
  title: string;
}
