import { IsOptional, IsInt, IsString, IsEnum } from 'class-validator';

export enum IvrTemplateStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export class UpdateIvrTemplateDto {
  @IsInt()
  id: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  flowUrl?: string;

  @IsOptional()
  @IsEnum(IvrTemplateStatus)
  status?: IvrTemplateStatus;
}
