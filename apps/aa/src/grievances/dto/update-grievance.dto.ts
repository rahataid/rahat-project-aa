import { PartialType } from '@nestjs/swagger';
import { CreateGrievanceDto } from './create-grievance.dto';

export class UpdateGrievanceDto extends PartialType(CreateGrievanceDto) {
  id: number;
}
