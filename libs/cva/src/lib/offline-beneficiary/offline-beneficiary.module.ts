import { Module } from '@nestjs/common';
import { CvaOfflineBeneficiaryController } from './offline-beneficiary.controller';
import { CvaOfflineBeneficiaryService } from './offline-beneficiary.service';

@Module({
  imports: [],
  controllers: [CvaOfflineBeneficiaryController],
  providers: [CvaOfflineBeneficiaryService],
})
export class CvaOfflineBeneficiaryModule {}
