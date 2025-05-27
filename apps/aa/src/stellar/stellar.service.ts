import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CheckTrustlineDto,
  FundAccountDto,
  SendAssetByWalletAddressDto,
  SendAssetDto,
  SendGroupDto,
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
  BeneficiaryRedeemDto,
} from './dto/trigger.dto';
import { ASSET } from '@rahataid/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.STELLAR)
    private readonly stellarQueue: Queue,
    private readonly disbursementService: DisbursementServices
  ) {}

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
    // const payoutType = await this.getBeneficiaryPayoutTypeByPhone(
    //   sendOtpDto.phoneNumber
    // );

    // if (payoutType.type != 'VENDOR') {
    //   throw new RpcException('Payout type is not VENDOR');
    // }

    // if (payoutType.mode === 'OFFLINE') {
    //   throw new RpcException('Payout mode is not ONLINE');
    // }

    return this.sendOtpByPhone(sendOtpDto);
  }

  private async sendOtpByPhone(sendOtpDto: SendOtpDto) {
    const beneficiaryRahatAmount = await this.getBenTotal(
      sendOtpDto?.phoneNumber
    );

    const amount = sendOtpDto?.amount || beneficiaryRahatAmount;

    if (Number(amount) > Number(beneficiaryRahatAmount)) {
      throw new RpcException('Amount is greater than rahat balance');
    }

    if (Number(amount) <= 0) {
      throw new RpcException('Amount must be greater than 0');
    }

    const res = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.otp.send_otp' },
        { phoneNumber: sendOtpDto.phoneNumber, amount }
      )
    );

    return this.storeOTP(res.otp, sendOtpDto.phoneNumber, amount as number);
  }

  async sendGroupOTP(sendGroupDto: SendGroupDto) {
    // Get all offline beneficiaries of the vendor
    const offlineBeneficiaries = await this.prisma.vendor.findUnique({
      where: {
        uuid: sendGroupDto.vendorUuid,
      },
      include: {
        OfflineBeneficiary: true,
      },
    });

    if (!offlineBeneficiaries) {
      throw new RpcException('Vendor not found');
    }

    // Get array of phone number from uuid
    const response = await lastValueFrom(
      this.client.send(
        { cmd: 'rahat.jobs.beneficiary.list_group_by_project' },
        { data: offlineBeneficiaries.OfflineBeneficiary.map((ben) => ben.uuid) }
      )
    );

    if (!response) {
      throw new RpcException('Beneficiaries not found');
    }
  }

  async sendAssetToVendor(verifyOtpDto: SendAssetDto) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: {
          walletAddress: verifyOtpDto.receiverAddress,
        },
      });

      if (!vendor) {
        throw new RpcException('Vendor not found');
      }

      const amount =
        verifyOtpDto?.amount ||
        (await this.getBenTotal(verifyOtpDto?.phoneNumber));

      this.logger.log(
        `Transferring ${amount} to ${verifyOtpDto.receiverAddress}`
      );

      await this.verifyOTP(
        verifyOtpDto.otp,
        verifyOtpDto.phoneNumber,
        amount as number
      );

      const keys = await this.getSecretByPhone(verifyOtpDto.phoneNumber);

      if (!keys) {
        throw new RpcException('Beneficiary address not found');
      }

      const result = await this.receiveService.sendAsset(
        keys.privateKey,
        verifyOtpDto.receiverAddress,
        amount.toString()
      );

      if (!result) {
        throw new RpcException(
          `Token transfer to ${verifyOtpDto.receiverAddress} failed`
        );
      }

      this.logger.log(`Transfer successful: ${result.tx.hash}`);

      // todo: create beneficiary redeem while sending otp
      await this.prisma.beneficiaryRedeem.create({
        data: {
          vendorUid: vendor.uuid,
          amount: amount as number,
          transactionType: 'VENDOR',
          beneficiaryWalletAddress: keys.publicKey,
          txHash: result.tx.hash,
          hasRedeemed: true,
        },
      });

      return {
        txHash: result.tx.hash,
      };
    } catch (error) {
      throw new RpcException(error ? error : 'OTP verification failed');
    }
  }

  async sendAssetToVendorByWalletAddress(
    sendAssetByWalletAddressDto: SendAssetByWalletAddressDto
  ) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: {
          walletAddress: sendAssetByWalletAddressDto.receiverAddress,
        },
      });

      if (!vendor) {
        throw new RpcException('Vendor not found');
      }

      const beneficiaryRahatAmount = await this.getRahatBalance(
        sendAssetByWalletAddressDto.walletAddress
      );

      const amount =
        sendAssetByWalletAddressDto?.amount || beneficiaryRahatAmount;

      if (Number(amount) > Number(beneficiaryRahatAmount)) {
        throw new RpcException('Amount is greater than rahat balance');
      }

      if (Number(amount) <= 0) {
        throw new RpcException('Amount must be greater than 0');
      }

      this.logger.log(
        `Transferring ${amount} to ${sendAssetByWalletAddressDto.receiverAddress}`
      );

      const keys = await this.getSecretByWallet(
        sendAssetByWalletAddressDto.walletAddress
      );

      if (!keys) {
        throw new RpcException('Beneficiary address not found');
      }

      const result = await this.receiveService.sendAsset(
        keys.privateKey,
        sendAssetByWalletAddressDto.receiverAddress,
        amount.toString()
      );

      if (!result) {
        throw new RpcException(
          `Token transfer to ${sendAssetByWalletAddressDto.receiverAddress} failed`
        );
      }

      this.logger.log(`Transfer successful: ${result.tx.hash}`);

      // todo: create beneficiary redeem while sending otp
      await this.prisma.beneficiaryRedeem.create({
        data: {
          vendorUid: vendor.uuid,
          amount: amount as number,
          transactionType: 'VENDOR',
          beneficiaryWalletAddress: keys.publicKey,
          txHash: result.tx.hash,
          hasRedeemed: true,
        },
      });

      return {
        txHash: result.tx.hash,
      };
    } catch (error) {
      throw new RpcException(error ? error : 'OTP verification failed');
    }
  }

  async checkTrustline(checkTrustlineDto: CheckTrustlineDto) {
    return this.transactionService.hasTrustline(
      checkTrustlineDto.walletAddress,
      ASSET.NAME,
      ASSET.ISSUER
    );
  }

  async faucetAndTrustlineService(account: FundAccountDto) {
    try {
      return this.receiveService.faucetAndTrustlineService(
        account.walletAddress,
        account?.secretKey
      );
    } catch (error) {
      throw new RpcException(
        `Failed to add trustline: ${JSON.stringify(error)}`
      );
    }
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

  async getWalletStats(walletBalanceDto: GetWalletBalanceDto) {
    return {
      balances: await this.receiveService.getAccountBalance(
        walletBalanceDto.address
      ),
      transactions: await this.getRecentTransaction(walletBalanceDto.address),
    };
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

  async getRedemptionRequest(vendorWallet: BeneficiaryRedeemDto) {
    try {
      const redemptionRequest = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: vendorWallet.uuid,
        },
        take: vendorWallet.take || 10,
        skip: vendorWallet.skip || 0,
      });

      if (!redemptionRequest.length) {
        throw new RpcException('No redemption requests found for vendor');
      }

      return redemptionRequest;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
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
      this.logger.log('Keys: ', keys);
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
      this.logger.log(`Beneficiary found: ${ben.address}`);
      return ben;
    } catch (error) {
      this.logger.log(
        `Couldn't find secret for phone ${phoneNumber}`,
        error.message
      );
      throw new RpcException(`Beneficiary with phone ${phoneNumber} not found`);
    }
  }

  private async getSecretByWallet(walletAddress: string) {
    try {
      const ben = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.wallet.getSecretByWallet' },
          { walletAddress, chain: 'stellar' }
        )
      );

      this.logger.log('Beneficiary found: ');
      return ben;
    } catch (error) {
      this.logger.log(
        `Couldn't find secret for wallet ${walletAddress}`,
        error.message
      );
      throw new RpcException(
        `Beneficiary with wallet ${walletAddress} not found`
      );
    }
  }

  private async storeOTP(otp: string, phoneNumber: string, amount: number) {
    const expiresAt = new Date();
    this.logger.log('Expires at: ', expiresAt);
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const otpHash = await bcrypt.hash(`${otp}:${amount}`, 10);
    this.logger.log('OTP hash: ', otpHash);

    const otpRes = await this.prisma.otp.upsert({
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

    delete otpRes.otpHash;

    return otpRes;
  }

  private async verifyOTP(otp: string, phoneNumber: string, amount: number) {
    const record = await this.prisma.otp.findUnique({
      where: { phoneNumber },
    });

    if (!record) {
      this.logger.log('OTP record not found');
      throw new RpcException('OTP record not found');
    }

    const now = new Date();
    if (record.expiresAt < now) {
      this.logger.log('OTP has expired');
      throw new RpcException('OTP has expired');
    }

    const isValid = await bcrypt.compare(`${otp}:${amount}`, record.otpHash);

    if (!isValid) {
      this.logger.log('Invalid OTP or amount mismatch');
      throw new RpcException('Invalid OTP or amount mismatch');
    }

    this.logger.log('OTP verified successfully');

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

      if (!rahatAsset) {
        this.logger.error('RAHAT asset not found in account balances');
        return 0;
      }

      this.logger.log('RAHAT asset balance:', rahatAsset.balance);

      return Math.floor(parseFloat(rahatAsset?.balance || '0'));
    } catch (error) {
      this.logger.error(error.message);
      return 0;
    }
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

  private async getBeneficiaryPayoutTypeByPhone(phone: string): Promise<any> {
    try {
      const beneficiary = await lastValueFrom(
        this.client.send({ cmd: 'rahat.jobs.beneficiary.get_by_phone' }, phone)
      );

      const beneficiaryGroups = await this.prisma.beneficiaryGroups.findUnique({
        where: {
          uuid: beneficiary.groupedBeneficiaries[0].beneficiaryGroupId,
        },
        include: {
          tokensReserved: {
            include: {
              payouts: true,
            },
          },
        },
      });

      return beneficiaryGroups.tokensReserved.payouts[0];
    } catch (error) {
      throw new Error(`Failed to retrieve payout type: ${error.message}`);
    }
  }
}
