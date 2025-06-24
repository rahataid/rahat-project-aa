import { IsEnum, IsUUID } from 'class-validator';
import { GrievanceStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateGrievanceStatusDto {
  @ApiProperty({ description: 'UUID of the grievance' })
  @IsUUID()
  uuid: string;

  @ApiProperty({ enum: GrievanceStatus })
  @IsEnum(GrievanceStatus)
  status: GrievanceStatus;
}
