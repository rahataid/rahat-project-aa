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

  @IsString()
  @IsNotEmpty()
  amount: string;
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
  txHash?: string | null;
}

export class TestVendorOfflinePayoutDto {
  @ApiProperty({
    description: 'Beneficiary group UUID to test offline payout',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  beneficiaryGroupUuid: string;

  @ApiProperty({
    description: 'Test amount for payout (optional)',
    example: '1000',
    required: false,
  })
  @IsOptional()
  @IsString()
  testAmount?: string;

  @ApiProperty({
    description: 'Whether to simulate the entire flow',
    example: true,
    required: false,
  })
  @IsOptional()
  simulateFlow?: boolean;
}
