import { Controller } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';
import {
  CheckTrustlineDto,
  FundAccountDto,
  RahatFaucetDto,
  SendAssetByWalletAddressDto,
  SendAssetDto,
  SendOtpDto,
} from './dto/send-otp.dto';
import { DisburseDto } from './dto/disburse.dto';
import {
  AddTriggerDto,
  GetTriggerDto,
  GetWalletBalanceDto,
  UpdateTriggerParamsDto,
} from './dto/trigger.dto';
import { Logger } from '@nestjs/common';
import { TransferToOfframpDto } from './dto/transfer-to-offramp.dto';

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
    return this.stellarService.addDisbursementJobs(disburseDto);
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

  // Send asset to vendor by wallet address
  @MessagePattern({
    cmd: JOBS.STELLAR.SEND_ASSET_TO_VENDOR_BY_WALLET,
    uuid: process.env.PROJECT_ID,
  })
  async sendAssetToVendorByWalletAddress(
    sendAssetByWalletAddressDto: SendAssetByWalletAddressDto
  ) {
    return this.stellarService.sendAssetToVendorByWalletAddress(
      sendAssetByWalletAddressDto
    );
  }

  // Funds account and adds rahat asset trustline
  @MessagePattern({
    cmd: JOBS.STELLAR.FUND_STELLAR_ACCOUNT,
    uuid: process.env.PROJECT_ID,
  })
  async fundStellarAccount(account: FundAccountDto) {
    return this.stellarService.faucetAndTrustlineService(account);
  }

  // Checks if the wallet address have trustline or not
  @MessagePattern({
    cmd: JOBS.STELLAR.CHECK_TRUSTLINE,
    uuid: process.env.PROJECT_ID,
  })
  async checkTrustline(account: CheckTrustlineDto) {
    return this.stellarService.checkTrustline(account);
  }

  // Returns all the required stats for the disbursement account
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_STELLAR_STATS,
    uuid: process.env.PROJECT_ID,
  })
  async getDisbursementStats() {
    return this.stellarService.getDisbursementStats();
  }

  // Returns all the required stats for the wallet
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_WALLET_BALANCE,
    uuid: process.env.PROJECT_ID,
  })
  async getWalletStats(address: GetWalletBalanceDto) {
    this.logger.log(`Getting wallet stats for ${address.address}`);
    return this.stellarService.getWalletStats(address);
  }

  // Get trigger from on-chain contract
  @MessagePattern({
    cmd: JOBS.STELLAR.GET_ONCHAIN_TRIGGER,
    uuid: process.env.PROJECT_ID,
  })
  async getTriggerWithID(trigger: GetTriggerDto) {
    return this.stellarService.getTriggerWithID(trigger);
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

  // Funds wallet Address with Rahat Asset
  @MessagePattern({
    cmd: JOBS.STELLAR.RAHAT_FAUCET,
    uuid: process.env.PROJECT_ID,
  })
  async rahatFaucet(account: RahatFaucetDto) {
    return this.stellarService.rahatFaucet(account);
  }

  // ***** Check and verify trustline for all beneficiary ********** //
  @MessagePattern({
    cmd: JOBS.STELLAR.CHECK_BULK_TRUSTLINE,
    uuid: process.env.PROJECT_ID,
  })
  async checkBulkTrustline(mode: 'dry' | 'live') {
    return this.stellarService.checkBulkTrustline(mode);
  }

  @MessagePattern({
    cmd: JOBS.STELLAR.INTERNAL_FAUCET_TRUSTLINE,
    uuid: process.env.PROJECT_ID,
  })
  async internalFaucetAndTrustline(beneficiaries: any) {
    return this.stellarService.internalFaucetAndTrustline(beneficiaries);
  }
}
