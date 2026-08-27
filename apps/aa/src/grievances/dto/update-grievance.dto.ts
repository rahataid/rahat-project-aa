import { PartialType } from '@nestjs/swagger';
import { CreateGrievanceDto } from './create-grievance.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateGrievanceDto extends PartialType(CreateGrievanceDto) {
  @ApiProperty({ description: 'ID of the grievance' })
  @IsUUID()
  uuid: string;

  @ApiProperty({ description: 'User making the update', required: false })
  @IsOptional()
  user?: any;
}
