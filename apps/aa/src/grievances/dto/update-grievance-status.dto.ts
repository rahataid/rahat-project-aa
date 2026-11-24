import { Allow, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { GrievanceStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateGrievanceStatusDto {
  @ApiProperty({ description: 'UUID of the grievance' })
  @IsUUID()
  uuid: string;

  @ApiProperty({ enum: GrievanceStatus })
  @IsEnum(GrievanceStatus)
  status: GrievanceStatus;

  @ApiProperty({ description: 'User making the update', required: false })
  @IsOptional()
  user?: any;

  @ApiProperty({
    description: 'Project id used for the project-scoped ability check',
    required: false,
  })
  @Allow()
  @IsOptional()
  @IsString()
  appId?: string;
}
