import { IsEnum, IsNumber } from 'class-validator';
import { GrievanceStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateGrievanceStatusDto {
  @ApiProperty({ description: 'ID of the grievance' })
  @IsNumber()
  id: number;

  @ApiProperty({ enum: GrievanceStatus })
  @IsEnum(GrievanceStatus)
  status: GrievanceStatus;
}
