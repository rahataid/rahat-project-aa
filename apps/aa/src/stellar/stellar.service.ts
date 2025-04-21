import { Inject, Injectable } from '@nestjs/common';
import { DisbursementServices, ReceiveService } from '@rahataid/stellar';
import {
  AddTriggerDto,
  FundAccountDto,
  SendAssetDto,
  SendOtpDto,
} from './dto/send-otp.dto';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';
import { generateCSV } from './utils/stellar.utils.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@rumsan/prisma';
import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  rpc as StellarRpc,
  Contract,
  xdr,
} from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  tenantName = 'sandab';
  server = new StellarRpc.Server('https://soroban-testnet.stellar.org');
  keypair = Keypair.fromSecret('SECRET_KEY');

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

    const disbursementService = new DisbursementServices(
      `owner@${this.tenantName}.stellar.rahat.io`,
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

  async sendAssetToVendor(verifyOtpDto: SendAssetDto) {
    const keys = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
        { phoneNumber: verifyOtpDto.phoneNumber, chain: 'stellar' }
      )
    );
    return this.receiveService.sendAsset(
      keys.privateKey,
      verifyOtpDto.receiverAddress,
      verifyOtpDto.amount
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

  async addTriggerOnChain(trigger: AddTriggerDto) {
    const transaction = await this.createTransaction(trigger.id);
    return this.prepareSignAndSend(transaction);
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
      { phone: string; amount: string; id: string; walletAddress: string }
    > = {};

    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;
      const totalBeneficiaries = group._count?.groupedBeneficiaries ?? 1;

      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      group.groupedBeneficiaries.forEach(({ Beneficiary }) => {
        console.log(Beneficiary);
        const phone = Beneficiary.pii.phone;
        const walletAddress = Beneficiary.walletAddress;
        const amount = tokenPerBeneficiary;

        if (csvData[phone]) {
          csvData[phone].amount = (
            parseFloat(csvData[phone].amount) + amount
          ).toString();
        } else {
          csvData[phone] = {
            phone,
            walletAddress,
            amount: amount.toString(),
            id: Beneficiary.uuid,
          };
        }
      });
    });

    return Object.values(csvData);
  }

  private async createTransaction(triggerId: string) {
    const publicKey = this.keypair.publicKey();
    const sourceAccount = await this.server.getAccount(publicKey);
    const CONTRACT_ID =
      'CCBMWNAW3MXSIG55EM2FPNLDU5OX2O3KJCQB4TTAUUBR54NXKMJ6CFUY';

    const contract = new Contract(CONTRACT_ID);
    let transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'add_trigger',
          xdr.ScVal.scvSymbol(triggerId || 'trigger1'),
          xdr.ScVal.scvString('manual'),
          xdr.ScVal.scvString('readiness'),
          xdr.ScVal.scvString('Flood Warning'),
          xdr.ScVal.scvString('glofas'),
          xdr.ScVal.scvString('Gandaki'),
          xdr.ScVal.scvU32(24),
          xdr.ScVal.scvU32(72),
          xdr.ScVal.scvU32(80),
          xdr.ScVal.scvBool(true)
        )
      )
      .setTimeout(30)
      .build();

    return transaction;
  }

  private async prepareSignAndSend(transaction) {
    const preparedTransaction = await this.server.prepareTransaction(
      transaction
    );
    preparedTransaction.sign(this.keypair);

    return this.server.sendTransaction(preparedTransaction);
  }
}
