import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FundAccountDto, SendAssetDto, SendOtpDto } from './dto/send-otp.dto';
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
  scValToNative,
} from '@stellar/stellar-sdk';
import bcrypt from 'bcryptjs';
import { SettingsService } from '@rumsan/settings';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE, JOBS } from '../constants';
import { Queue } from 'bull';
import {
  AddTriggerDto,
  GetTriggerDto,
  GetWalletBalanceDto,
  UpdateTriggerParamsDto,
  VendorStatsDto,
} from './dto/trigger.dto';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.STELLAR)
    private readonly stellarQueue: Queue
  ) {
    this.receiveService = new ReceiveService();
    this.transactionService = new TransactionService();
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
    // Check if beneficiary is has vendor payout or not

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

      const keys = await this.getSecretByPhone(verifyOtpDto.phoneNumber);
      return this.receiveService.sendAsset(
        keys.privateKey,
        verifyOtpDto.receiverAddress,
        amount as string
      );
    } catch (error) {
      throw new RpcException(error ? error : 'OTP verification failed');
    }
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

  async addTriggerOnChain(trigger: AddTriggerDto[]) {
    return this.stellarQueue.add(JOBS.STELLAR.ADD_ONCHAIN_TRIGGER, trigger, {
      attempts: 3,
      removeOnComplete: true,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }

  async getWalletStats(address: GetWalletBalanceDto) {
    return {
      balances: await this.receiveService.getAccountBalance(address.address),
      transactions: await this.getRecentTransaction(address.address),
    };
  }

  async getTriggerWithID(trigger: GetTriggerDto) {
    try {
      const { server, sourceAccount, contract } =
        await this.getStellarObjects();

      let transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          contract.call('get_trigger', xdr.ScVal.scvString(trigger.id))
        )
        .setTimeout(30)
        .build();

      const preparedTransaction = await server.prepareTransaction(transaction);
      const sim = await server.simulateTransaction(preparedTransaction);

      //@ts-ignore
      const nativeResult = scValToNative(sim.result.retval);

      if (!nativeResult) {
        throw new RpcException(`Contract with id ${trigger.id} not found`);
      }
      let result = {};
      if (Array.isArray(nativeResult)) {
        nativeResult.forEach((item) => {
          if (item && typeof item === 'object' && item._attributes) {
            try {
              const key =
                typeof item._attributes.key._value === 'object'
                  ? JSON.stringify(item._attributes.key._value)
                  : String(item._attributes.key._value);

              const value =
                typeof item._attributes.val._value === 'object'
                  ? JSON.stringify(item._attributes.val._value)
                  : String(item._attributes.val._value);

              result[key] = value;
            } catch (e) {
              this.logger.warn(
                `Could not process item: ${JSON.stringify(item)}`
              );
            }
          }
        });
      } else if (nativeResult && typeof nativeResult === 'object') {
        result = nativeResult;
      } else {
        result = { value: nativeResult };
      }
      this.logger.log('Contract result:', result);
      return result;
    } catch (error) {
      this.logger.error('Error processing contract result:', error);
      throw new RpcException(
        `Failed to process contract result: ${error.message}`
      );
    }
  }

  async updateOnchainTrigger(trigger: UpdateTriggerParamsDto) {
    return this.stellarQueue.add(
      JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE,
      trigger,
      {
        attempts: 3,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }
    );
  }

  async getDisbursementStats() {
    const disbursementBalance = await this.getRahatBalance(
      await this.disbursementService.getDistributionAddress(
        await this.getFromSettings('TENANTNAME')
      )
    );

    const vendors = await this.prisma.vendor.findMany({
      select: { walletAddress: true },
    });

    let totalVendorBalance = 0;

    await Promise.all(
      vendors.map(async (vendor) => {
        totalVendorBalance += await this.getRahatBalance(vendor.walletAddress);
      })
    );

    return {
      tokenStats: [
        {
          name: 'Disbursement Balance',
          amount: (disbursementBalance + totalVendorBalance).toLocaleString(),
        },
        {
          name: 'Disbursed Balance',
          amount: totalVendorBalance.toLocaleString(),
        },
        {
          name: 'Remaining Balance',
          amount: disbursementBalance.toLocaleString(),
        },
        { name: 'Token Price', amount: 'Rs 10' },
      ],
      transactionStats: await this.getRecentTransaction(
        await this.disbursementService.getDistributionAddress(
          await this.getFromSettings('TENANTNAME')
        )
      ),
    };
  }

  async getVendorWalletStats(vendorWallet: VendorStatsDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: vendorWallet.uuid },
    });
    return this.getWalletStats({ address: vendor.walletAddress });
  }

  // ---------- Private functions ----------------
  private async getStellarObjects() {
    const server = new StellarRpc.Server(await this.getFromSettings('SERVER'));
    const keypair = Keypair.fromSecret(await this.getFromSettings('KEYPAIR'));
    const publicKey = keypair.publicKey();
    const contractId = await this.getFromSettings('CONTRACTID');
    const sourceAccount = await server.getAccount(publicKey);
    const contract = new Contract(contractId);

    return {
      server,
      keypair,
      publicKey,
      contractId,
      sourceAccount,
      contract,
    };
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

    this.logger.log(`Computing beneficiary token distribution`);
    groups.forEach((group) => {
      const groupToken = tokens.find((t) => t.groupId === group.uuid);
      const totalTokens = groupToken?.numberOfTokens ?? 0;

      const totalBeneficiaries = group._count?.groupedBeneficiaries;
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

  private async getBenTotal(phoneNumber: string) {
    try {
      const keys = await this.getSecretByPhone(phoneNumber);
      return this.getRahatBalance(keys.address);
    } catch (error) {
      throw new RpcException(error);
    }
  }

  private async getSecretByPhone(phoneNumber: string) {
    try {
      const ben = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.wallet.getSecretByPhone' },
          { phoneNumber, chain: 'stellar' }
        )
      );
      return ben;
    } catch (error) {
      throw new RpcException(`Beneficiary with phone ${phoneNumber} not found`);
    }
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
      throw new RpcException('OTP record not found');
    }

    const now = new Date();
    if (record.expiresAt < now) {
      throw new RpcException('OTP has expired');
    }

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);
    if (!isValid) {
      throw new RpcException('Invalid OTP or amount mismatch');
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
    try {
      const accountBalances = await this.receiveService.getAccountBalance(keys);

      const rahatAsset = accountBalances?.find(
        (bal: any) => bal.asset_code === 'RAHAT'
      );

      return Math.floor(parseFloat(rahatAsset?.balance || '0'));
    } catch (error) {
      this.logger.error(error.message);
      return 0;
    }
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

  private async getRecentTransaction(address: string) {
    const transactions = await this.transactionService.getTransaction(
      address,
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
        hash: txn.hash,
      };
    });
  }
}
