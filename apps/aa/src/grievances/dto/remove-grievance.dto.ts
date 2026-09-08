// create-grievance-params.dto.ts
import { IsOptional, IsUUID } from 'class-validator';

export class RemoveGrievanceDto {
  @IsUUID()
  uuid: string;

  @IsOptional()
  user?: any;
}
