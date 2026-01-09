import { PartialType } from '@nestjs/swagger';
import { CreateGrievanceDto } from './create-grievance.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpdateGrievanceDto extends PartialType(CreateGrievanceDto) {
  @ApiProperty({ description: 'ID of the grievance' })
  @IsUUID()
  uuid: string;
}
