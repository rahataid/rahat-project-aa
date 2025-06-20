// create-grievance-params.dto.ts
import { IsNumber } from 'class-validator';

export class RemoveGrievanceDto {
  @IsNumber()
  id: number;
}
