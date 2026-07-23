import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const SETTING_DATA_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'OBJECT'] as const;

export class SettingPayloadItemDto {
  @ApiProperty({ description: 'Setting name, e.g. CHAIN_SETTINGS' })
  @IsString()
  name: string;

  @ApiProperty({
    description:
      'Setting value. For OBJECT dataType this is a JSON-encoded string.',
  })
  value: unknown;

  @ApiProperty({ enum: SETTING_DATA_TYPES })
  @IsIn(SETTING_DATA_TYPES)
  dataType: (typeof SETTING_DATA_TYPES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  requiredFields?: unknown;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class UpdateSettingsPayloadDto {
  @ApiProperty({ description: 'Project this payload targets' })
  @IsString()
  projectId: string;

  @ApiProperty({ type: [SettingPayloadItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingPayloadItemDto)
  settings: SettingPayloadItemDto[];
}
