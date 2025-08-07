import { IsOptional, IsString } from 'class-validator';

export class DisburseDto {
  @IsString()
  dName: string;

  @IsOptional()
  groups?: string[];
}

export interface IDisbursementResultDto {
  disbursementID: string;
  assetIssuer: string;
}