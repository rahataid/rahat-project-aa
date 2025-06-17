import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GrievanceStatus, GrievanceType } from '@prisma/client';

export class CreateGrievanceDto {
  @ApiProperty({
    description: 'Name of the person reporting the grievance',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  reportedBy: string;

  @ApiProperty({
    description: 'ID of the user reporting the grievance',
    example: 123,
  })
  @IsInt()
  @IsNotEmpty()
  reporterUserId: number;

  @ApiProperty({
    description: 'Contact information of the reporter',
    example: 'john@example.com or +1234567890',
  })
  @IsString()
  @IsNotEmpty()
  reporterContact: string;

  @ApiProperty({
    description: 'Title of the grievance',
    example: 'Login issues',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Type of the grievance',
    enum: GrievanceType,
    example: GrievanceType.TECHNICAL,
  })
  @IsEnum(GrievanceType)
  @IsNotEmpty()
  type: GrievanceType;

  @ApiProperty({
    description: 'Detailed description of the grievance',
    example: 'Unable to login to the system since morning.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Status of the grievance',
    enum: GrievanceStatus,
    default: GrievanceStatus.NEW,
    required: false,
  })
  @IsEnum(GrievanceStatus)
  @IsOptional()
  status?: GrievanceStatus;
}
