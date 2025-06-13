import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

enum ReedemStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
}

export class CreateVendorReimbursementDto {
  constructor() {
    this.tokenAddress = '';
    this.voucherAmount = 0;
    this.vendorId = '';
    this.status = ReedemStatus.REQUESTED;
  }

  @IsString()
  @IsNotEmpty()
  tokenAddress: string;

  @IsNumber()
  @IsNotEmpty()
  voucherAmount: number;

  @IsString()
  @IsNotEmpty()
  vendorId: string;

  @IsEnum(ReedemStatus)
  @IsNotEmpty()
  status: ReedemStatus;
}

export class GetVendorReimbursementDto {
  constructor() {
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;
}
