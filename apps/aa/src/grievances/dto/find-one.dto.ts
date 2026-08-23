// create-grievance-params.dto.ts
import { IsUUID } from 'class-validator';

export class FindGrievanceParamsDto {
  @IsUUID()
  uuid: string;

  // TODO: QUICK FIX: REMOVE LATER
  user?: any;
}
