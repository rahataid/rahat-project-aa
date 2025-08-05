import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { VendorsService } from './vendors.service';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { PaginationBaseDto } from './common';
import { VendorStatsDto, VendorRedeemDto } from './dto/vendorStats.dto';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import {
  CreateVendorTokenRedemptionDto,
  UpdateVendorTokenRedemptionDto,
  GetVendorTokenRedemptionDto,
  ListVendorTokenRedemptionDto,
  GetVendorRedemptionsDto,
} from './dto/vendorTokenRedemption.dto';

@Controller()
export class VendorsController {
  constructor(
    private readonly vendorService: VendorsService,
    private readonly vendorTokenRedemptionService: VendorTokenRedemptionService
  ) {}
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

  // Token Redemption Endpoints
  @MessagePattern({
    cmd: JOBS.VENDOR.CREATE_TOKEN_REDEMPTION,
    uuid: process.env.PROJECT_ID,
  })
  async createTokenRedemption(dto: CreateVendorTokenRedemptionDto) {
    return this.vendorTokenRedemptionService.create(dto);
  }

  @MessagePattern({
    cmd: JOBS.VENDOR.GET_TOKEN_REDEMPTION,
    uuid: process.env.PROJECT_ID,
  })
  async getTokenRedemption(dto: GetVendorTokenRedemptionDto) {
    return this.vendorTokenRedemptionService.findOne(dto);
  }

  @MessagePattern({
    cmd: JOBS.VENDOR.UPDATE_TOKEN_REDEMPTION_STATUS,
    uuid: process.env.PROJECT_ID,
  })
  async updateTokenRedemptionStatus(dto: UpdateVendorTokenRedemptionDto) {
    return this.vendorTokenRedemptionService.update(dto);
  }

  @MessagePattern({
    cmd: JOBS.VENDOR.LIST_TOKEN_REDEMPTIONS,
    uuid: process.env.PROJECT_ID,
  })
  async listTokenRedemptions(query: ListVendorTokenRedemptionDto) {
    return this.vendorTokenRedemptionService.list(query);
  }

  @MessagePattern({
    cmd: JOBS.VENDOR.GET_VENDOR_REDEMPTIONS,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorRedemptions(dto: GetVendorRedemptionsDto) {
    return this.vendorTokenRedemptionService.getVendorRedemptions(dto);
  }
}
