import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetBenfGroupDto {
  @IsBoolean()
  @IsOptional()
  hasPayout?: boolean;

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsBoolean()
  tokenAssigned?: boolean

  @ApiProperty({
    example: 1,
    description: 'page number',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiProperty({
    example: 10,
    description: 'number of items per page',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  perPage?: number = 100;

  @ApiProperty({
    example: 'createdAt',
    description: 'Sort field',
    required: false,
  })
  @IsOptional()
  @IsString()
  sort: string;

  @ApiProperty({
    example: 'desc',
    description: 'Sort order',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
} 