import { Controller, Logger } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { VendorsService } from './vendors.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto, VendorRedeemDto } from './dto/vendorStats.dto';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import { VendorOfflinePayoutDto } from './dto/vendor-offline-payout.dto';

@Controller('vendors')
export class VendorsController {
  private readonly logger = new Logger(VendorsController.name);

  constructor(private readonly vendorsService: VendorsService) {}

  @MessagePattern({
    cmd: JOBS.VENDOR.LIST_WITH_PROJECT_DATA,
    uuid: process.env.PROJECT_ID,
  })
  listWithData(query: PaginationBaseDto): any {
    return this.vendorsService.listWithProjectData(query);
  }

  // Return required stats for a vendor address
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_VENDOR_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorStats(vendorWallet: VendorStatsDto) {
    return this.vendorsService.getVendorWalletStats(vendorWallet);
  }

  // Returns all redemption requests of a vendor
  // @MessagePattern({
  //   cmd: JOBS.STELLAR.GET_REDEMPTION_REQUEST,
  //   uuid: process.env.PROJECT_ID,
  // })
  // async getRedemptionRequest(vendorWallet: VendorRedeemDto) {
  //   return this.vendorsService.getRedemptionRequest(vendorWallet);
  // }

  // Returns all redemption requests of a vendor and txn list for vendors
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_REDEMPTION_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  async getTxnAndRedemptionRequestList(vendorWallet: VendorRedeemTxnListDto) {
    return this.vendorsService.getTxnAndRedemptionList(vendorWallet);
  }

  // Returns beneficiaries assigned to a vendor based on payout mode
  @MessagePattern({
    cmd: JOBS.VENDOR.GET_BENEFICIARIES,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorBeneficiaries(payload: VendorBeneficiariesDto) {
    return this.vendorsService.getVendorBeneficiaries(payload);
  }

  @MessagePattern({
    cmd: JOBS.VENDOR.OFFLINE_PAYOUT,
    uuid: process.env.PROJECT_ID,
  })
  async processVendorOfflinePayout(payload: VendorOfflinePayoutDto) {
    this.logger.log('Processing vendor offline payout request');
    return this.vendorsService.processVendorOfflinePayout(payload);
  }
}
