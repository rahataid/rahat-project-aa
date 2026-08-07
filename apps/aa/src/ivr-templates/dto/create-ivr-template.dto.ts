import { IsOptional, IsString } from 'class-validator';

export class CreateIvrTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  flowUrl?: string;
}
