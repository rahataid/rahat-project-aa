import { Module } from '@nestjs/common';
import { CvaBeneficiaryRedeemController } from './beneficiary-redeem.controller';
import { CvaBeneficiaryRedeemService } from './beneficiary-redeem.service';

@Module({
  imports: [],
  controllers: [CvaBeneficiaryRedeemController],
  providers: [CvaBeneficiaryRedeemService],
})
export class CvaBeneficiaryRedeemModule {}
