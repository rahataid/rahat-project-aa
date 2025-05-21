import { Controller } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import {
  CheckTrustlineDto,
  FundAccountDto,
  SendAssetDto,
  SendOtpDto,
} from './dto/send-otp.dto';
import { DisburseDto } from './dto/disburse.dto';
import {
  AddTriggerDto,
  GetTriggerDto,
  GetWalletBalanceDto,
  UpdateTriggerParamsDto,
  VendorRedemptionRequestDto,
} from './dto/trigger.dto';
import { Logger } from '@nestjs/common';

@Controller('stellar')
export class StellarController {
  private readonly logger = new Logger(StellarController.name);
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
    this.logger.log('Sending OTP to beneficiary');
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

  @MessagePattern({
    cmd: JOBS.STELLAR.CHECK_TRUSTLINE,
    uuid: process.env.PROJECT_ID,
  })
  async checkTrustline(account: CheckTrustlineDto) {
    return this.stellarService.checkTrustline(account);
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
    cmd: JOBS.STELLAR.GET_REDEMPTION_REQUEST,
    uuid: process.env.PROJECT_ID,
  })
  async getRedemptionRequest(vendorWallet: VendorRedemptionRequestDto) {
    return this.stellarService.getRedemptionRequest(vendorWallet);
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
