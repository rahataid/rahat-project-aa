import { PartialType } from '@nestjs/mapped-types';
import { CreateBeneficiaryRedeemDto } from './create-beneficiary-redeem.dto';

export class UpdateBeneficiaryRedeemDto extends PartialType(CreateBeneficiaryRedeemDto) {} 