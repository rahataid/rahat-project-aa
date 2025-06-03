import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateBeneficiaryGroupTokenDto {
  @ApiProperty({
    example: 'NOT_DISBURSED',
    description: 'The status of the beneficiary group token',
  })
  @IsString()
  @IsOptional()
  status: string;

  @ApiProperty({
    example: true,
    description: 'Indicates if the beneficiary group token is disbursed',
  })
  @IsString()
  isDisbursed: boolean;

  @ApiProperty({
    example: {
      disbursementDate: '2025-05-27',
      disbursementAmount: 1000,
      disbursementStatus: 'SUCCESS',
    },
    description: 'The disbursement data in JSON format',
  })
  @IsOptional()
  info?: object;
}
