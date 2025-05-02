import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AddTriggerDto,
  FundAccountDto,
  SendAssetDto,
  SendOtpDto,
} from './dto/send-otp.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { DisburseDto } from './dto/disburse.dto';
import { generateCSV, generateParamsHash } from './utils/stellar.utils.service';
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
import { SettingsService } from '@rumsan/settings';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  constructor(
    @Inject('RAHAT_CORE_PROJECT_CLIENT') private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService
  ) {
    this.initializeDisbursementService();
  }

  private disbursementService: DisbursementServices;
  receiveService = new ReceiveService();
  transactionService = new TransactionService();

  async disburse(disburseDto: DisburseDto) {
    const groups =
      (disburseDto?.groups && disburseDto?.groups.length) > 0
        ? disburseDto.groups
        : await this.getGroupsUuids();

    this.logger.log('Token Disburse for: ', groups);
    const bens = await this.getBeneficiaryTokenBalance(groups);
    this.logger.log(`Beneficiary Token Balance: ${bens.length}`);

    const csvBuffer = await generateCSV(bens);

    let totalTokens: number = 0;
    if (!bens) {
      throw new RpcException('Beneficiary Token Balance not found');
    }

    bens?.forEach((ben) => {
      this.logger.log(`Beneficiary: ${ben.walletAddress} has ${ben.amount}`);
      totalTokens += parseInt(ben.amount);
    });

    this.logger.log(`Total Tokens: ${totalTokens}`);

    return this.disbursementService.createDisbursementProcess(
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
      const amount =
        verifyOtpDto?.amount ||
        (await this.getBenTotal(verifyOtpDto?.phoneNumber));

      await this.verifyOTP(
        verifyOtpDto.otp,
        verifyOtpDto.phoneNumber,
        amount as number
      );
    } catch (error) {
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

    this.logger.log(`Found ${groups.length} groups`);
    this.logger.log(`Found ${tokens.length} tokens`);

    return this.computeBeneficiaryTokenDistribution(groups, tokens);
  }

  async addTriggerOnChain(trigger: AddTriggerDto) {
    const transaction = await this.createTransaction(trigger);
    return this.prepareSignAndSend(transaction);
  }

  async getDisbursementStats() {
    // Disbursement Account balance
    const disbursementBalance = await this.getRahatBalance(
      await this.disbursementService.getDistributionAddress(
        await this.getFromSettings('TENANTNAME')
      )
    );

    // Vendor address balance
    const disbursedBalance = await this.getRahatBalance(
      await this.getFromSettings('VENDORADDRESS')
    );

    return {
      tokenStats: [
        {
          name: 'Disbursement Balance',
          amount: disbursementBalance.toLocaleString(),
        },
        {
          name: 'Disbursed Balance',
          amount: disbursedBalance.toLocaleString(),
        },
        { name: 'Token Price', amount: 'Rs 10' },
      ],
      transactionStats: await this.getRecentTransaction(),
    };
  }

  // ---------- Private functions ----------------
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

    this.logger.log(`Computing beneficiary token distribution`);
    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;
      const totalBeneficiaries = group._count?.groupedBeneficiaries ?? 1;

      const tokenPerBeneficiary = totalTokens / totalBeneficiaries;

      group.groupedBeneficiaries.forEach(({ Beneficiary }) => {
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

  private async createTransaction(triggerId: AddTriggerDto) {
    const server = new StellarRpc.Server(await this.getFromSettings('SERVER'));
    const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
    const publicKey = keypair.publicKey();
    const sourceAccount = await server.getAccount(publicKey);
    const CONTRACT_ID = await this.getFromSettings('CONTRACTID');

    const paramsHash = generateParamsHash(triggerId.params);

    const contract = new Contract(CONTRACT_ID);
    let transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'add_trigger',
          xdr.ScVal.scvSymbol(triggerId.id),
          xdr.ScVal.scvString(triggerId.trigger_type),
          xdr.ScVal.scvString(triggerId.phase),
          xdr.ScVal.scvString(triggerId.title),
          xdr.ScVal.scvString(triggerId.source),
          xdr.ScVal.scvString(triggerId.river_basin),
          xdr.ScVal.scvString(paramsHash),
          xdr.ScVal.scvBool(triggerId.is_mandatory)
        )
      )
      .setTimeout(30)
      .build();

    return transaction;
  }

  private async prepareSignAndSend(transaction) {
    try {
      const server = new StellarRpc.Server(
        await this.getFromSettings('SERVER')
      );
      const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
      const preparedTransaction = await server.prepareTransaction(transaction);
      this.logger.log('Prepared transaction');
      preparedTransaction.sign(keypair);
      this.logger.log('Signed transaction');
      const txn = server.sendTransaction(preparedTransaction);
      this.logger.log('Transaction successfully sent');
      return txn;
    } catch (error) {
      this.logger.error('Error in transaction:', error);
      throw new RpcException(
        error instanceof Error ? error.message : 'Transaction failed'
      );
    }
  }

  private async getBenTotal(phoneNumber: string) {
    const keys = await this.getSecretByPhone(phoneNumber);
    return this.getRahatBalance(keys.address);
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
      where: {
        tokensReserved: {
          numberOfTokens: {
            gt: 0,
          },
        },
      },
      select: { uuid: true },
    });
    return benGroups.map((group) => group.uuid);
  }

  private async getFromSettings(key: string) {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    return settings?.value[key];
  }

  private async getRahatBalance(keys) {
    const accountBalances = await this.receiveService.getAccountBalance(keys);
    const rahatAsset = accountBalances?.find(
      (bal: any) => bal.asset_code === 'RAHAT'
    );

    return Math.floor(parseFloat(rahatAsset?.balance || '0'));
  }

  private async initializeDisbursementService() {
    const [email, password, tenantName] = await Promise.all([
      this.getFromSettings('EMAIL'),
      this.getFromSettings('PASSWORD'),
      this.getFromSettings('TENANTNAME'),
    ]);
    this.disbursementService = new DisbursementServices(
      email,
      password,
      tenantName
    );
  }

  private async getRecentTransaction() {
    const transactions = await this.transactionService.getTransaction(
      await this.disbursementService.getDistributionAddress(
        await this.getFromSettings('TENANTNAME')
      ),
      10,
      'desc'
    );

    return transactions.map((txn) => {
      return {
        title: txn.asset,
        subtitle: txn.source,
        date: txn.created_at,
        amount: Number(txn.amount).toFixed(0),
        amtColor: txn.amtColor,
      };
    });
  }
}
