import {
  IsUUID,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetVendorOfflineBeneficiariesDto {
  @IsUUID()
  vendorUuid: string;
}

export interface OfflineBeneficiaryDetail {
  uuid: string;
  beneficiaryUuid: string;
  beneficiaryName: string;
  phoneNumber: string;
  otpHash: string;
  amount: number;
  status: string;
}

export class VerifyVendorOfflineOtpDto {
  @IsUUID()
  vendorUuid: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  otp: string;
}

export interface OtpVerificationResult {
  isValid: boolean;
  message: string;
  beneficiaryUuid?: string;
  amount?: number;
  walletAddress?: string;
}

export class VendorOfflineSyncItem {
  @IsString()
  beneficiaryUuid: string;

  @IsString()
  otp: string; // OTP provided by beneficiary
}

export class VendorOfflineSyncDto {
  @IsUUID()
  vendorUuid: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorOfflineSyncItem)
  verifiedBeneficiaries: VendorOfflineSyncItem[];
}
