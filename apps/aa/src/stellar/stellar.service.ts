import { Inject, Injectable } from '@nestjs/common';
import { DisbursementServices, ReceiveService } from '@rahataid/stellar';
import { FundAccountDto, SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';
import { generateCSV } from './utils/stellar.utils.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@rumsan/prisma';

@Injectable()
export class StellarService {
  tenantName = 'sandab';
  constructor(
    @Inject('RAHAT_CORE_PROJECT_CLIENT') private readonly client: ClientProxy,
    private readonly prisma: PrismaService,
    private configService: ConfigService
  ) {}
  receiveService = new ReceiveService();
  async disburse(disburseDto: DisburseDto) {
    const verificationPin = this.configService.get('SDP_VERIFICATION_PIN');
    const bens = await this.getBeneficiaryTokenBalance(disburseDto.groups);
    const csvBuffer = await generateCSV(bens, verificationPin);

    console.log(csvBuffer);

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

  async getBeneficiaryTokenBalance(groupUuids: string[]) {
    if (!groupUuids.length) return [];

    const [groups, tokens] = await Promise.all([
      this.fetchGroupedBeneficiaries(groupUuids),
      this.fetchGroupTokenAmounts(groupUuids),
    ]);

    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  private async fetchGroupedBeneficiaries(groupUuids: string[]) {
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: groupUuids.map((uuid) => ({ uuid })) }
      )
    );

    return response.data ?? [];
  }

  private async fetchGroupTokenAmounts(groupUuids: string[]) {
    return this.prisma.beneficiaryGroupTokens.findMany({
      where: { groupId: { in: groupUuids } },
      select: { numberOfTokens: true, groupId: true },
    });
  }

  private computeBeneficiaryTokenDistribution(
    groups: any[],
    tokens: { numberOfTokens: number; groupId: string }[]
  ) {
    const csvData: Record<
      string,
      { phone: string; amount: string; id: string }
    > = {};

    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;
      const totalBeneficiaries = group._count?.groupedBeneficiaries ?? 1;

      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      group.groupedBeneficiaries.forEach(({ Beneficiary }) => {
        const phone = Beneficiary.pii.phone;
        const amount = tokenPerBeneficiary;

        if (csvData[phone]) {
          csvData[phone].amount = (
            parseFloat(csvData[phone].amount) + amount
          ).toString();
        } else {
          csvData[phone] = {
            phone,
            amount: amount.toString(),
            id: Beneficiary.uuid,
          };
        }
      });
    });

    return Object.values(csvData);
  }
}
