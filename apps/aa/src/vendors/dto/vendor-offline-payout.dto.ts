import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClaimDto {
  @ApiProperty({
    description: 'Phone number of the beneficiary',
    example: '98670023857',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    description: 'Amount to be claimed',
    example: '1000',
  })
  @IsString()
  @IsNotEmpty()
  amount: string;
}

export class BulkOtpDto {
  @ApiProperty({
    type: [CreateClaimDto],
    description: 'Array of OTP requests',
    example: [
      {
        phoneNumber: '98670023857',
        amount: '1000',
      },
      {
        phoneNumber: '98670023858',
        amount: '2000',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClaimDto)
  requests: CreateClaimDto[];
}

export class VendorOfflinePayoutDto {
  @IsString()
  @IsNotEmpty()
  beneficiaryGroupUuid: string;
}

export class SendGroupOtpDto {
  @IsString()
  @IsNotEmpty()
  beneficiaryGroupUuid: string;

  @IsString()
  @IsNotEmpty()
  vendorUuid: string;

  @IsOptional()
  @IsString()
  amount?: string;
}

export interface BeneficiaryOtpData {
  phoneNumber: string;
  walletAddress: string;
  amount: number;
  otpHash: string;
  expiryDate: Date;
}
