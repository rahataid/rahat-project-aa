import { Inject, Injectable } from '@nestjs/common';
import { DisbursementServices, ReceiveService } from '@rahataid/stellar';
import { FundAccountDto, SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';
import { generateCSV } from './utils/stellar.utils.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StellarService {
  tenantName = 'sandab';
  constructor(
    @Inject('RAHAT_CORE_PROJECT_CLIENT') private readonly client: ClientProxy,
    private configService: ConfigService
  ) {}
  receiveService = new ReceiveService();
  async disburse(disburseDto: DisburseDto) {
    const verificationPin = this.configService.get('SDP_VERIFICATION_PIN');
    // Get list of beneficiares to disburse
    // Mock data
    const bens = [{ phone: disburseDto.phoneNumber, amount: '10', id: 1 }];
    // Get CSV file
    const csvBuffer = await generateCSV(bens, verificationPin);
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
      `+977${sendOtpDto.phoneNumber}`
    );
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    return this.receiveService.verifyOTP(
      verifyOtpDto.auth,
      `+977${verifyOtpDto.phoneNumber}`,
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
