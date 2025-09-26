import { ApiProperty } from '@nestjs/swagger';
import {
  GrievancePriority,
  GrievanceStatus,
  GrievanceType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Custom validator for phone number or email
function IsEmailOrPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isEmailOrPhoneNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return false;

          // Check if it's an email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(value)) return true;

          // Check if it's a phone number (supports international format with optional +)
          const phoneRegex =
            /^[+]?[\s.-]?(?:\(?\d{1,3}\)?[\s.-]?)?\d{3,}[\s.-]?\d{4,}$/;
          return phoneRegex.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid email or phone number`;
        },
      },
    });
  };
}

export interface CreatedByUser {
  id: number;
  name: string;
  email: string;
}

export class CreatedByUserDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: 123,
  })
  @IsInt()
  @IsNotEmpty()
  id: number;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, {
    message: 'Name must be at least 2 characters long',
  })
  @MaxLength(100, {
    message: 'Name must not be longer than 100 characters',
  })
  name: string;

  @ApiProperty({
    description: 'Email address of the user',
    example: 'john@example.com',
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail(
    {},
    {
      message: 'Email must be a valid email address',
    }
  )
  email: string;
}

export class CreateGrievanceDto {
  @ApiProperty({
    description: 'Name of the person reporting the grievance',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  reportedBy: string;

  @ApiProperty({
    description: 'Contact information of the reporter (email or phone number)',
    example: 'john@example.com or +1234567890',
  })
  @IsString()
  @IsNotEmpty()
  @IsEmailOrPhoneNumber({
    message: 'reporterContact must be a valid email or phone number',
  })
  reporterContact: string;

  @ApiProperty({
    description: 'Title of the grievance (5-100 characters)',
    example: 'Login issues',
    minLength: 5,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, {
    message: 'Title must be at least 5 characters long',
  })
  @MaxLength(100, {
    message: 'Title must not be longer than 100 characters',
  })
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
    description: 'Detailed description of the grievance (10-1000 characters)',
    example: 'Unable to login to the system since morning.',
    minLength: 10,
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, {
    message: 'Description must be at least 10 characters long',
  })
  @MaxLength(1000, {
    message: 'Description must not be longer than 1000 characters',
  })
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

  @ApiProperty({
    description: 'Priority of the grievance',
    enum: GrievancePriority,
    default: GrievancePriority.LOW,
    required: false,
  })
  @IsEnum(GrievancePriority)
  @IsOptional()
  priority?: GrievancePriority;

  @ApiProperty({
    description: 'Tags of the grievance',
    example: ['tag1', 'tag2'],
    required: false,
  })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({
    description: 'Information about the user who created the grievance',
    type: CreatedByUserDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatedByUserDto)
  createdByUser?: CreatedByUserDto;
}
