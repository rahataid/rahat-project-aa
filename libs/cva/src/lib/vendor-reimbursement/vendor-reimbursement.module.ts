import { Module } from '@nestjs/common';
import { CvaVendorReimbursementController } from './vendor-reimbursement.controller';
import { CvaVendorReimbursementService } from './vendor-reimbursement.service';

@Module({
  imports: [],
  controllers: [CvaVendorReimbursementController],
  providers: [CvaVendorReimbursementService],
})
export class CvaVendorReimbursementModule {}
