// create-grievance-params.dto.ts
import { Allow, IsOptional, IsString, IsUUID } from 'class-validator';

export class FindGrievanceParamsDto {
  @IsUUID()
  uuid: string;

  // TODO: QUICK FIX: REMOVE LATER
  @IsOptional()
  user?: any;

  @Allow()
  @IsOptional()
  @IsString()
  appId?: string;
}
