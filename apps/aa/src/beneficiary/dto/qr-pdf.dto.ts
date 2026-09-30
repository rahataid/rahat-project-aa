import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { QR_PDF_MAX_FIELDS } from '../../constants';

export class GenerateQrPdfDto {
  @IsUUID()
  groupId: string;

  @IsOptional()
  @IsBoolean()
  includeOtp?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeUnphonedBeneficiaries?: boolean;

  // Arbitrary, case-insensitive tokens matched against each beneficiary's
  // own `extras` keys; a token with no matching key is dropped per-beneficiary.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(QR_PDF_MAX_FIELDS)
  @IsString({ each: true })
  pdfFields?: string[];
}

export class RegenerateQrPdfDto extends GenerateQrPdfDto {}
