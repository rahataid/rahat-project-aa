import { ApiProperty } from '@nestjs/swagger';
import { SettingDataType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';

export class SettingNameValueDto {
  @ApiProperty({ description: 'Setting name, e.g. CHAIN_SETTINGS' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'New value for the setting' })
  @IsDefined()
  value: unknown;

  @ApiProperty({
    enum: SettingDataType,
    required: false,
    description:
      'Required only when the setting does not exist yet and needs to be created',
  })
  @IsOptional()
  @IsEnum(SettingDataType)
  dataType?: SettingDataType;
}

export class UpdateSettingsByNameDto {
  @ApiProperty({ type: [SettingNameValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingNameValueDto)
  settings: SettingNameValueDto[];
}
