// create-grievance-params.dto.ts
import { IsUUID } from 'class-validator';

export class RemoveGrievanceDto {
  @IsUUID()
  uuid: string;
}
