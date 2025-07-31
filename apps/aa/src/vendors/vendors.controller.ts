import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { VendorsService } from './vendors.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto, VendorRedeemDto } from './dto/vendorStats.dto';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';

@Controller()
export class VendorsController {
  constructor(private readonly vendorService: VendorsService) {}
  @MessagePattern({
    cmd: JOBS.VENDOR.LIST_WITH_PROJECT_DATA,
    uuid: process.env.PROJECT_ID,
  })
  listWithData(query: PaginationBaseDto): any {
    return this.vendorService.listWithProjectData(query);
  }

  // Return required stats for a vendor address
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_VENDOR_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorStats(vendorWallet: VendorStatsDto) {
    return this.vendorService.getVendorWalletStats(vendorWallet);
  }

  // Returns all redemption requests of a vendor
  // @MessagePattern({
  //   cmd: JOBS.STELLAR.GET_REDEMPTION_REQUEST,
  //   uuid: process.env.PROJECT_ID,
  // })
  // async getRedemptionRequest(vendorWallet: VendorRedeemDto) {
  //   return this.vendorService.getRedemptionRequest(vendorWallet);
  // }

  // Returns all redemption requests of a vendor and txn list for vendors
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_REDEMPTION_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  async getTxnAndRedemptionRequestList(vendorWallet: VendorRedeemTxnListDto) {
    return this.vendorService.getTxnAndRedemptionList(vendorWallet);
  }

  // Returns beneficiaries assigned to a vendor based on payout mode
  @MessagePattern({
    cmd: JOBS.VENDOR.GET_BENEFICIARIES,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorBeneficiaries(payload: VendorBeneficiariesDto) {
    return this.vendorService.getVendorBeneficiaries(payload);
  }
}
