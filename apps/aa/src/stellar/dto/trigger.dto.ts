import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsJSON,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddTriggerDto {
  @IsString()
  id: string;

  @IsString()
  trigger_type: string;

  @IsString()
  phase: string;

  @IsString()
  title: string;

  @IsString()
  source: string;

  @IsString()
  river_basin: string;

  @IsJSON()
  params: JSON;

  @IsBoolean()
  is_mandatory: boolean;
}

export class GetTriggerDto {
  @IsString()
  id: string;
}

export class UpdateTriggerParamsDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  source?: string;

  @IsBoolean()
  @IsOptional()
  isTriggered?: boolean;

  @IsObject()
  @IsOptional()
  params?: Record<string, any>;
}

export class GetWalletBalanceDto {
  @IsString()
  address: string;
}

export class BeneficiaryRedeemDto {
  @IsString()
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
