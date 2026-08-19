import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsString, ValidateNested } from 'class-validator';

export class SettingNameValueDto {
  @ApiProperty({ description: 'Setting name, e.g. CHAIN_SETTINGS' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'New value for the setting' })
  @IsDefined()
  value: unknown;
}

export class UpdateSettingsByNameDto {
  @ApiProperty({ type: [SettingNameValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingNameValueDto)
  settings: SettingNameValueDto[];
}
