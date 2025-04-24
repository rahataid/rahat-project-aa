import { IsOptional, IsString } from 'class-validator';

export class DisburseDto {
  @IsString()
  dName: string;

  @IsOptional()
  groups?: string[];
}
