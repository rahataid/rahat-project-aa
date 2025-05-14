import { Controller } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import { FundAccountDto, SendAssetDto, SendOtpDto } from './dto/send-otp.dto';
import { DisburseDto } from './dto/disburse.dto';
import {
  AddTriggerDto,
  GetTriggerDto,
  GetWalletBalanceDto,
  UpdateTriggerParamsDto,
  VendorStatsDto,
} from './dto/trigger.dto';

@Controller('stellar')
export class StellarController {
  constructor(private readonly stellarService: StellarService) {}

  // Create disbursement
  @MessagePattern({
    cmd: JOBS.STELLAR.DISBURSE,
    uuid: process.env.PROJECT_ID,
  })
  async disburse(disburseDto: DisburseDto) {
    return this.stellarService.disburse(disburseDto);
  }

  // Send otp to authenticate beneficiary
  @MessagePattern({
    cmd: JOBS.STELLAR.SEND_OTP,
    uuid: process.env.PROJECT_ID,
  })
  async sendOtp(sendAssetDto: SendOtpDto) {
    return this.stellarService.sendOtp(sendAssetDto);
  }

  // Verifies OTP and send Asset to vendor
  @MessagePattern({
    cmd: JOBS.STELLAR.SEND_ASSET_TO_VENDOR,
    uuid: process.env.PROJECT_ID,
  })
  async sendAssetToVendor(sendAssetDto: SendAssetDto) {
    return this.stellarService.sendAssetToVendor(sendAssetDto);
  }

  // Funds account and adds rahat asset trustline
  @MessagePattern({
    cmd: JOBS.STELLAR.FUND_STELLAR_ACCOUNT,
    uuid: process.env.PROJECT_ID,
  })
  async fundStellarAccount(account: FundAccountDto) {
    return this.stellarService.faucetAndTrustlineService(account);
  }

  // Returns all the required stats for the disbursement
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_STELLAR_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getDisbursementStats() {
    return this.stellarService.getDisbursementStats();
  }

  // Return required stats for a vendor address
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_VENDOR_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getVendorStats(vendorWallet: VendorStatsDto) {
    return this.stellarService.getVendorWalletStats(vendorWallet);
  }

  // Get trigger from on-chain contract
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_ONCHAIN_TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async getTriggerWithID(trigger: GetTriggerDto) {
    return this.stellarService.getTriggerWithID(trigger);
  }

  @MessagePattern({
    cmd: JOBS.STELLAR.GET_WALLET_BALANCE,
    uuid: process.env.PROJECT_ID,
  })
  async getWalletStats(address: GetWalletBalanceDto) {
    console.log(address);
    return this.stellarService.getWalletStats(address);
  }

  // ------ Onchain triggers: Remove after testing ------
  // Adds trigger to the on-chain contract
  @MessagePattern({
    cmd: JOBS.STELLAR.ADD_ONCHAIN_TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async addTriggerOnChain(trigger: AddTriggerDto[]) {
    return this.stellarService.addTriggerOnChain(trigger);
  }

  // Update trigger from on-chain contract
  @MessagePattern({
    cmd: JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async updateOnchainTrigger(trigger: UpdateTriggerParamsDto) {
    return this.stellarService.updateOnchainTrigger(trigger);
  }
}
