import { Inject, Injectable } from '@nestjs/common';
import { DisbursementServices, ReceiveService } from '@rahataid/stellar-sdk';
import {
  AddTriggerDto,
  FundAccountDto,
  SendAssetDto,
  SendOtpDto,
} from './dto/send-otp.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';
import { generateCSV } from './utils/stellar.utils.service';
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
import bcrypt from 'bcryptjs';

@Injectable()
export class StellarService {
  tenantName = 'sandab';
  server = new StellarRpc.Server('https://soroban-testnet.stellar.org');
  keypair = Keypair.fromSecret(
    'SAKQYFOKZFZI2LDGNMMWN3UQA6JP4F3JVUEDHVUYYWHCVQIE764WTGBU'
  );
  email = `owner@${this.tenantName}.stellar.rahat.io`;
  password = 'Password123!';

  constructor(
    @Inject('RAHAT_CORE_PROJECT_CLIENT') private readonly client: ClientProxy,
    private readonly prisma: PrismaService
  ) {}
  receiveService = new ReceiveService();
  async disburse(disburseDto: DisburseDto) {
    const groups =
      (disburseDto?.groups && disburseDto?.groups.length) > 0
        ? disburseDto.groups
        : await this.getGroupsUuids();

    console.log(groups.length);

    return;

    const bens = await this.getBeneficiaryTokenBalance(groups);
    const csvBuffer = await generateCSV(bens);

    const disbursementService = new DisbursementServices(
      this.email,
      this.password,
      this.tenantName
    );

    let totalTokens: number;
    bens.forEach((ben) => {
      totalTokens += Number(ben.amount);
    });

    return disbursementService.createDisbursementProcess(
      disburseDto.dName,
      csvBuffer,
      `${disburseDto.dName}_file`,
      totalTokens.toString()
    );
  }

  async sendOtp(sendOtpDto: SendOtpDto) {
    const amount =
      sendOtpDto?.amount || (await this.getBenTotal(sendOtpDto?.phoneNumber));
    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.otp.send_otp' },
        { phoneNumber: sendOtpDto.phoneNumber, amount }
      )
    );

    return this.storeOTP(res.otp, sendOtpDto.phoneNumber, amount as number);
  }

  async sendAssetToVendor(verifyOtpDto: SendAssetDto) {
    try {
      await this.verifyOTP(
        verifyOtpDto.otp,
        verifyOtpDto.phoneNumber,
        verifyOtpDto.amount as number
      );
    } catch (error) {
      console.log(error);
      throw new Error(
        error instanceof Error ? error.message : 'OTP verification failed'
      );
    }

    const keys = await this.getSecretByPhone(verifyOtpDto.phoneNumber);
    return this.receiveService.sendAsset(
      keys.privateKey,
      verifyOtpDto.receiverAddress,
      verifyOtpDto.amount as string
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

  private async getBenTotal(phoneNumber: string) {
    const keys = await this.getSecretByPhone(phoneNumber);
    const accountBalances = await this.receiveService.getAccountBalance(
      keys.address
    );
    const rahatAsset = accountBalances?.find(
      (bal: any) => bal.asset_code === 'RAHAT'
    );
    return Math.floor(parseFloat(rahatAsset?.balance || '0'));
  }

  private async getSecretByPhone(phoneNumber: string) {
    return lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
        { phoneNumber: phoneNumber, chain: 'stellar' }
      )
    );
  }

  private async storeOTP(otp: string, phoneNumber: string, amount: number) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const otpHash = await bcrypt.hash(`${otp}:${amount}`, 10);

    return await this.prisma.otp.upsert({
      where: {
        phoneNumber,
      },
      update: {
        otpHash,
        amount,
        expiresAt,
        updatedAt: new Date(),
      },
      create: {
        phoneNumber,
        otpHash,
        amount,
        expiresAt,
      },
    });
  }

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({
      where: { phoneNumber },
    });

    if (!record) {
      throw new Error('OTP record not found');
    }

    const now = new Date();
    if (record.expiresAt < now) {
      throw new Error('OTP has expired');
    }

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);
    if (!isValid) {
      throw new Error('Invalid OTP or amount mismatch');
    }

    return true;
  }

  private async getGroupsUuids() {
    const benGroups = await this.prisma.beneficiaryGroups.findMany({
      select: { uuid: true },
    });
    return benGroups.map((group) => group.uuid);
  }
}
