import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
} from 'class-validator';

enum STATUS {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  SYNCED = 'SYNCED',
}

export class CreateOfflineBeneficiaryDto {
  constructor(data: CreateOfflineBeneficiaryDto) {
    this.txHash = data.txHash;
    this.otpHash = data.otpHash;
    this.vendorId = data.vendorId;
    this.disbursementId = data.disbursementId;
    this.amount = data.amount;
    this.status = data.status;
  }

  @IsString()
  @IsNotEmpty()
  txHash: string;

  @IsString()
  @IsNotEmpty()
  otpHash: string;

  @IsString()
  @IsNotEmpty()
  vendorId: string;

  @IsString()
  @IsNotEmpty()
  disbursementId: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsEnum(STATUS)
  @IsNotEmpty()
  status: STATUS;
}

export class GetOfflineBeneficiaryDto {
  @IsString()
  @IsNotEmpty()
  uuid!: string;
}
