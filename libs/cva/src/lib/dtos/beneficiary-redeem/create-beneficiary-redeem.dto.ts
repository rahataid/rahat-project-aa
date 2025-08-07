import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PayoutType , PayoutTransactionType} from '@prisma/client';

export class CreateBeneficiaryRedeemDto {
  @IsString()
  @IsNotEmpty()
  beneficiaryWalletAddress: string = '';

  @IsBoolean()
  @IsOptional()
  hasRedeemed?: boolean = false;

  @IsEnum(PayoutTransactionType)
  @IsNotEmpty()
  transactionType: PayoutTransactionType = PayoutTransactionType.VENDOR_REIMBURSEMENT;

  @IsUUID()
  @IsOptional()
  vendorUid?: string;

  @IsString()
  @IsOptional()
  fspId?: string;
}

export class GetBeneficiaryRedeemDto {
  constructor() {
    this.uuid = '';
  }

  @IsString()
  @IsNotEmpty()
  uuid: string;
}
