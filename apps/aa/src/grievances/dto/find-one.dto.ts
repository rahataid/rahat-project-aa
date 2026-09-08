// create-grievance-params.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class FindGrievanceParamsDto {
  @IsUUID()
  uuid: string;

  // TODO: QUICK FIX: REMOVE LATER
  @IsOptional()
  user?: any;
}
