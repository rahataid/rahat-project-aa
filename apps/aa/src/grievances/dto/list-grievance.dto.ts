import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GrievancePriority,
  GrievanceStatus,
  GrievanceType,
} from '@prisma/client';

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

  @IsOptional()
  @IsEnum(GrievanceStatus)
  status: GrievanceStatus;

  @IsOptional()
  @IsEnum(GrievanceType)
  type: GrievanceType;

  @IsOptional()
  @IsEnum(GrievancePriority)
  priority: GrievancePriority;
}
