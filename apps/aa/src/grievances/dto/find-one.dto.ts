// create-grievance-params.dto.ts
import { IsNumber } from 'class-validator';

export class FindGrievanceParamsDto {
  @IsNumber()
  id: number;
}
