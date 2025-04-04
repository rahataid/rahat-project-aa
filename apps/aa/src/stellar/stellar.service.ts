import { Inject, Injectable } from '@nestjs/common';
import { DisbursementServices, ReceiveService } from '@rahataid/stellar';
import { StellarUtilsService } from './stellar.utils.service';
import { FundAccountDto, SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';

@Injectable()
export class StellarService {
  tenantName = 'sandab';
  constructor(
    private readonly stellarUtils: StellarUtilsService,
    @Inject('RAHAT_CORE_PROJECT_CLIENT') private readonly client: ClientProxy
  ) {}
  receiveService = new ReceiveService();
  async disburse(disburseDto: DisburseDto) {
    // Get list of beneficiares to disburse
    // Mock data
    const bens = [{ phone: '+9779868823984', amount: '10', id: 1 }];
    // Get CSV file
    const csvBuffer = await this.stellarUtils.generateCSV(bens);
    // Call disburse function from stellar sdk
    const disbursementService = new DisbursementServices(
      'owner@sandab.stellar.rahat.io',
      'Password123!',
      this.tenantName
    );

    return disbursementService.createDisbursementProcess(
      disburseDto.dName,
      csvBuffer,
      'disbursement'
    );
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    const walletAddress = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.wallet.getWalletByphone' },
        { phoneNumber: sendOtpDto.phoneNumber }
      )
    );

    return this.receiveService.sendOTP(
      this.tenantName,
      walletAddress,
      sendOtpDto.phoneNumber
    );
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    return this.receiveService.verifyOTP(
      this.tenantName,
      verifyOtpDto.phoneNumber,
      verifyOtpDto.otp,
      verifyOtpDto.verification
    );
  }

  async faucetAndTrustlineService(account: FundAccountDto) {
    return this.receiveService.faucetAndTrustlineService(
      account.walletAddress,
      account.secretKey
    );
  }
}
