import {
  DisbursementServices,
  IDisbursement,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CheckTrustlineDto,
  FundAccountDto,
  RahatFaucetDto,
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
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { Queue } from 'bull';
import {
  AddTriggerDto,
  GetTriggerDto,
  GetWalletBalanceDto,
  UpdateTriggerParamsDto,
} from './dto/trigger.dto';
import { TransferToOfframpDto } from './dto/transfer-to-offramp.dto';
import { FSPPayoutDetails } from '../processors/types';
import { AppService } from '../app/app.service';
import { getFormattedTimeDiff } from '../utils/date';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

interface BatchInfo {
  batchIndex: number;
  totalBatches: number;
  batchSize: number;
  totalWallets: number;
}

interface InternalFaucetBatchJob {
  wallets: any[];
  batchInfo: BatchInfo;
  beneficiaryGroupId: string;
}

interface InternalFaucetResponse {
  message: string;
  batchesCreated: number;
  totalWallets?: number;
  jobIds?: any[];
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly settingService: SettingsService,
    private readonly prisma: PrismaService,
    @InjectQueue(BQUEUE.STELLAR_CHECK_TRUSTLINE)
    private readonly checkTrustlineQueue: Queue,
    @InjectQueue(BQUEUE.STELLAR)
    private readonly stellarQueue: Queue,
    private readonly disbursementService: DisbursementServices,
    private readonly receiveService: ReceiveService,
    private readonly transactionService: TransactionService,
    private readonly appService: AppService,
    private readonly eventEmitter: EventEmitter2,
    private configService: ConfigService
  ) {}

  async addDisbursementJobs(disburseDto: DisburseDto) {
    const groupUuids =
      (disburseDto?.groups && disburseDto?.groups.length) > 0
        ? disburseDto.groups
        : await this.getDisbursableGroupsUuids();

    if (groupUuids.length === 0) {
      this.logger.warn('No groups found for disbursement');
      return {
        message: 'No groups found for disbursement',
        groups: [],
      };
    }

    const groups = await this.getGroupsFromUuid(groupUuids);

    this.logger.log(`Adding disbursement jobs ${groups.length} groups`);

    this.stellarQueue.addBulk(
      groups.map(({ uuid, tokensReserved }) => ({
        name: JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE,
        data: {
          dName: `${tokensReserved.title.toLocaleLowerCase()}_${
            disburseDto.dName
          }`,
          groups: [uuid],
        },
        opts: {
          attempts: 3,
          delay: 2000,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }))
    );

    return {
      message: `Disbursement jobs added for ${groups.length} groups`,
      groups: groups.map((group) => ({
        uuid: group,
        status: 'PENDING',
      })),
    };
  }

  // async transferToOfframpJobs(transferToOfframpDto: TransferToOfframpDto) {
  //   const beneficiaries = transferToOfframpDto.beneficiaryWalletAddress;

  //   if (typeof beneficiaries === 'string') {
  //     this.stellarQueue.add(JOBS.STELLAR.TRANSFER_TO_OFFRAMP, {
  //       offRampWalletAddress: transferToOfframpDto.offRampWalletAddress,
  //       beneficiaryWalletAddress: beneficiaries,
  //     });
  //     return {
  //       message: `Transfer to offramp job added for ${beneficiaries}`,
  //       beneficiaries: [beneficiaries],
  //     };
  //   }

  //   beneficiaries.forEach((ben) => {
  //     this.stellarQueue.add(JOBS.STELLAR.TRANSFER_TO_OFFRAMP, {
  //       offRampWalletAddress: transferToOfframpDto.offRampWalletAddress,
  //       beneficiaryWalletAddress: ben,
  //     });
  //   });

  //   return {
  //     message: `Transfer to offramp jobs added for ${beneficiaries.length} beneficiaries`,
  //     beneficiaries: beneficiaries.map((ben) => ({
  //       walletAddress: ben,
  //       status: 'PENDING',
  //     })),
  //   };
  // }

  async disburse(disburseDto: DisburseDto) {
    const groups =
      (disburseDto?.groups && disburseDto?.groups.length) > 0
        ? disburseDto.groups
        : await this.getDisbursableGroupsUuids();

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

  async getDisbursement(disbursementId: string) {
    return await this.disbursementService.getDisbursement(disbursementId);
  }

  // todo: add payout part
  async sendOtp(sendOtpDto: SendOtpDto) {
    const payoutType = await this.getBeneficiaryPayoutTypeByPhone(
      sendOtpDto.phoneNumber
    );

    if (!payoutType) {
      this.logger.error('Payout not initiated');
      throw new RpcException('Payout not initiated');
    }

    if (payoutType.type != 'VENDOR') {
      this.logger.error('Payout type is not VENDOR');
      throw new RpcException('Payout type is not VENDOR');
    }

    if (payoutType.mode != 'ONLINE') {
      this.logger.error('Payout mode is not ONLINE');
      throw new RpcException('Payout mode is not ONLINE');
    }

    return this.sendOtpByPhone(sendOtpDto, payoutType.uuid);
  }

  private async sendOtpByPhone(sendOtpDto: SendOtpDto, payoutId: string) {
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

    // Get beneficiary wallet address
    const keys = (await this.getSecretByPhone(sendOtpDto.phoneNumber)) as any;
    if (!keys) {
      throw new RpcException('Beneficiary address not found');
    }

    // Get vendor wallet address
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: sendOtpDto.vendorUuid },
      select: { walletAddress: true },
    });

    if (!vendor) {
      throw new RpcException('Vendor not found');
    }

    // Find existing BeneficiaryRedeem record for this beneficiary
    const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
      where: {
        beneficiaryWalletAddress: keys.publicKey,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingRedeem) {
      // Update existing record with new vendor and reset status
      await this.prisma.beneficiaryRedeem.update({
        where: {
          uuid: existingRedeem.uuid,
        },
        data: {
          vendorUid: sendOtpDto.vendorUuid,
          amount: amount as number,
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          payoutId: payoutId,
          info: {
            message: 'OTP sent to beneficiary',
            transactionHash: '',
            offrampWalletAddress: vendor.walletAddress,
            beneficiaryWalletAddress: keys.publicKey,
          },
        },
      });
    } else {
      // Create new record if none exists
      await this.prisma.beneficiaryRedeem.create({
        data: {
          beneficiaryWalletAddress: keys.publicKey,
          amount: amount as number,
          transactionType: 'VENDOR_REIMBURSEMENT',
          status: 'PENDING',
          isCompleted: false,
          txHash: null,
          vendorUid: sendOtpDto.vendorUuid,
          payoutId: payoutId,
          info: {
            message: 'OTP sent to beneficiary',
            transactionHash: '',
            offrampWalletAddress: vendor.walletAddress,
            beneficiaryWalletAddress: keys.publicKey,
          },
        },
      });
    }

    return this.storeOTP(res.otp, sendOtpDto.phoneNumber, amount as number);
  }

  async sendGroupOTP(sendGroupDto: SendGroupDto) {
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

  // todo: Make this dynamic for evm
  async sendAssetToVendor(
    verifyOtpDto: SendAssetDto,
    skipOtpVerification: boolean = false,
    skipBeneficiaryRedeemCreation: boolean = false
  ) {
    const projectId = this.configService.get('PROJECT_ID');
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

      // Skip OTP verification for offline flows
      if (!skipOtpVerification) {
        await this.verifyOTP(
          verifyOtpDto.otp,
          verifyOtpDto.phoneNumber,
          amount as number
        );
      }

      const keys = (await this.getSecretByPhone(
        verifyOtpDto.phoneNumber
      )) as any;

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

      let updatedRedemption;

      // Skip beneficiary redeem record creation if requested (for offline flows)
      if (!skipBeneficiaryRedeemCreation) {
        // Find and update the existing BeneficiaryRedeem record
        const existingRedeem = await this.prisma.beneficiaryRedeem.findFirst({
          where: {
            beneficiaryWalletAddress: keys.publicKey,
            vendorUid: vendor.uuid,
            status: 'PENDING',
            isCompleted: false,
            txHash: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            Vendor: true,
          },
        });

        if (!existingRedeem) {
          this.logger.warn(
            `No pending BeneficiaryRedeem record found for beneficiary ${keys.publicKey} and vendor ${vendor.uuid}. Asset transfer was successful but no record to update.`
          );
          // Create a new record since the transfer was successful
          updatedRedemption = await this.prisma.beneficiaryRedeem.create({
            data: {
              beneficiaryWalletAddress: keys.publicKey,
              vendorUid: vendor.uuid,
              amount: Number(amount) as number,
              transactionType: 'VENDOR_REIMBURSEMENT',
              txHash: result.tx.hash,
              isCompleted: true,
              status: 'COMPLETED',
              info: {
                message: 'Beneficiary Redemption successful',
                transactionHash: result.tx.hash,
                offrampWalletAddress: vendor.walletAddress,
                beneficiaryWalletAddress: keys.publicKey,
              },
            },
            include: {
              Vendor: true,
            },
          });
        } else {
          // Update the existing BeneficiaryRedeem record with transaction details
          updatedRedemption = await this.prisma.beneficiaryRedeem.update({
            where: {
              uuid: existingRedeem.uuid,
            },
            data: {
              vendorUid: vendor.uuid,
              txHash: result.tx.hash,
              isCompleted: true,
              status: 'COMPLETED',
              info: {
                message: 'Beneficiary Redemption successful',
                transactionHash: result.tx.hash,
                offrampWalletAddress: vendor.walletAddress,
                beneficiaryWalletAddress: keys.publicKey,
              },
            },
            include: {
              Vendor: true,
            },
          });
        }
      }

      // Emit notification only if beneficiary redeem record was created/updated
      if (!skipBeneficiaryRedeemCreation && updatedRedemption) {
        this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
          payload: {
            title: `Vendor Redemption Completed`,
            description: `Vendor ${
              updatedRedemption?.Vendor?.name
            } redeemed for beneficiary ${
              updatedRedemption?.beneficiaryWalletAddress
            } on ${new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(
              new Date(updatedRedemption?.updateAt)
            )}. Transaction completed`,
            group: 'Vendor Management',
            projectId: projectId,
            notify: true,
          },
        });
      }
      return {
        txHash: result.tx.hash,
      };
    } catch (error) {
      // Update BeneficiaryRedeem record with error information if possible
      if (!skipBeneficiaryRedeemCreation) {
        try {
          const keys = (await this.getSecretByPhone(
            verifyOtpDto.phoneNumber
          )) as any;

          if (keys) {
            const existingRedeem =
              await this.prisma.beneficiaryRedeem.findFirst({
                where: {
                  beneficiaryWalletAddress: keys.publicKey,
                  status: 'PENDING',
                  isCompleted: false,
                },
                orderBy: {
                  createdAt: 'desc',
                },
              });

            if (existingRedeem) {
              await this.prisma.beneficiaryRedeem.update({
                where: {
                  uuid: existingRedeem.uuid,
                },
                data: {
                  status: 'FAILED',
                  isCompleted: false,
                  info: {
                    message: `Beneficiary Redemption failed: ${
                      error.message || 'Unknown error'
                    }`,
                    transactionHash: '',
                    offrampWalletAddress: verifyOtpDto.receiverAddress,
                    beneficiaryWalletAddress: keys.publicKey,
                    error: error.message || 'Unknown error',
                  },
                },
              });
            }
          }
        } catch (updateError) {
          this.logger.error(
            'Failed to update BeneficiaryRedeem record with error info:',
            updateError
          );
        }
      }

      throw new RpcException(
        error ? error : 'Transferring asset to vendor failed'
      );
    }
  }

  // todo: Make this dynamic for evm
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

      // Create BeneficiaryRedeem record for direct wallet transfer
      await this.prisma.beneficiaryRedeem.create({
        data: {
          vendorUid: vendor.uuid,
          amount: amount as number,
          transactionType: 'VENDOR_REIMBURSEMENT',
          beneficiaryWalletAddress: keys.publicKey,
          txHash: result.tx.hash,
          isCompleted: true,
          status: 'COMPLETED',
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
      checkTrustlineDto.walletAddress
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
    try {
      let { address } = walletBalanceDto;
      // check if address is a phone number or wallet address
      const isPhone = address.startsWith('+') || address.startsWith('9');

      if (isPhone) {
        this.logger.log(`Getting wallet stats for phone ${address}`);

        const beneficiary = await lastValueFrom(
          this.client.send(
            { cmd: 'rahat.jobs.beneficiary.get_by_phone' },
            address
          )
        );

        if (!beneficiary) {
          throw new RpcException(
            `Beneficiary not found with wallet ${walletBalanceDto.address}`
          );
        }

        address = beneficiary.walletAddress;
      }

      this.logger.log(`Getting wallet stats for ${address}`);

      // todo (new-chain-config): Need dynamic method to getAccountBalance and getRecent transactions
      return {
        balances: await this.receiveService.getAccountBalance(address),
        transactions: await this.getRecentTransaction(address),
      };
    } catch (error) {
      this.logger.error('Error getting wallet stats:', error);
      throw new RpcException(error?.message);
    }
  }

  // todo (new-chain-config): Make process dynamic
  async addTriggerOnChain(triggers: AddTriggerDto[]) {
    return this.stellarQueue.add(
      JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE,
      { triggers },
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

  // todo (new-chain-config): Need separate method for evm
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

  // todo (new-chain-config): Need dynamic method according to chain
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

  async getActivityActivationTime() {
    const projectInfo = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });

    if (!projectInfo) {
      throw new RpcException('Project info not found, in SETTINGS');
    }
    const activeYear = projectInfo?.value?.active_year;
    const riverBasin = projectInfo?.value?.river_basin;

    if (!activeYear || !riverBasin) {
      this.logger.warn(`Active year or river basin not found, in SETTINGS`);

      return null;
    }

    const data = await lastValueFrom(
      this.client.send(
        { cmd: 'ms.jobs.phases.getAll' },
        {
          activeYear,
          riverBasin,
        }
      )
    );

    const activationPhase = data.data.find((p) => p.name === 'ACTIVATION');

    if (!activationPhase) {
      this.logger.warn(
        `Activation phase not found for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return null;
    }

    if (!activationPhase.isActive) {
      this.logger.warn(
        `Activation phase is not active for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return null;
    }

    return activationPhase.activatedAt;
  }

  // todo (new-chain-config): Need dynamic method according to chain
  async getDisbursementStats() {
    const oneTokenPrice = (await this.getFromSettings('ONE_TOKEN_PRICE')) ?? 1;
    const tokenName = (await this.getFromSettings('ASSETCODE')) ?? 'RAHAT';

    const benfTokens = await this.prisma.beneficiaryGroupTokens.findMany({
      include: {
        beneficiaryGroup: {
          include: {
            _count: {
              select: {
                beneficiaries: true,
              },
            },
          },
        },
      },
    });

    const totalDisbursedTokens = benfTokens.reduce((acc, token) => {
      if (token.isDisbursed) {
        acc += token.numberOfTokens;
      }
      return acc;
    }, 0);

    const totalTokens = benfTokens.reduce(
      (acc, token) => acc + token.numberOfTokens,
      0
    );

    const totalBeneficiaries = benfTokens
      .filter((token) => token.isDisbursed)
      .reduce(
        (acc, token) => acc + token.beneficiaryGroup._count.beneficiaries,
        0
      );

    const disbursementsInfo = benfTokens
      .filter(
        (token) =>
          token.isDisbursed && (token.info as any)?.disbursementTimeTaken
      )
      .map((token) => (token.info as any)?.disbursementTimeTaken);

    const averageDisbursementTime =
      disbursementsInfo.reduce((acc, time) => acc + time, 0) /
      disbursementsInfo.length;

    const activityActivationTime = await this.getActivityActivationTime();
    let averageDuration = 0;

    if (activityActivationTime) {
      averageDuration =
        benfTokens
          .filter((b) => b.isDisbursed && (b.info as any)?.disbursement)
          .reduce((acc, token) => {
            const info = JSON.parse(JSON.stringify(token.info)) as {
              disbursement: IDisbursement;
            };
            // getting disbursement completion time
            const {
              disbursement: { updated_at },
            } = info;

            // diff between disbursement completion time and activity activation time
            const timeTaken =
              new Date(updated_at).getTime() -
              new Date(activityActivationTime).getTime();

            return acc + timeTaken;
          }, 0) /
        benfTokens.filter((b) => b.isDisbursed && (b.info as any)?.disbursement)
          .length;

      averageDuration = averageDuration;
    }

    return [
      {
        name: 'Token Disbursed',
        value: totalDisbursedTokens,
      },
      {
        name: 'Budget Assigned',
        value: totalTokens * oneTokenPrice,
      },
      {
        name: 'Token',
        value: tokenName,
      },
      { name: 'Token Price', value: oneTokenPrice },
      { name: 'Total Beneficiaries', value: totalBeneficiaries },
      {
        name: 'Average Disbursement time',
        value: getFormattedTimeDiff(averageDisbursementTime),
      },
      {
        name: 'Average Duration',
        value:
          averageDuration !== 0 ? getFormattedTimeDiff(averageDuration) : 'N/A',
      },
    ];
  }

  async checkBulkTrustline(mode: 'dry' | 'live') {
    this.checkTrustlineQueue.add(
      JOBS.STELLAR.CHECK_BULK_TRUSTLINE_QUEUE,
      mode,
      {
        attempts: 1,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }
    );

    return {
      message: 'Check bulk trustline job added',
    };
  }

  // todo (new-chain-config): Need dynamic faucet according to chain
  async rahatFaucet(account: RahatFaucetDto) {
    try {
      return this.transactionService.rahatFaucetService(
        account.walletAddress,
        account.amount
      );
    } catch (error) {
      throw new RpcException(error);
    }
  }

  // todo (new-chain-config): Need dynamic queue
  async internalFaucetAndTrustline(beneficiaries: {
    wallets: any[];
    beneficiaryGroupId: string;
  }): Promise<InternalFaucetResponse> {
    const { wallets, beneficiaryGroupId } = beneficiaries;

    if (!wallets || wallets.length === 0) {
      this.logger.warn('No wallets provided for faucet and trustline');
      return {
        message: 'No wallets provided for processing',
        batchesCreated: 0,
      };
    }

    const batchSize = await this.getBatchSizeFromSettings();
    const batches = this.createWalletBatches(wallets, batchSize);

    this.logger.log(
      `Creating ${batches.length} batch jobs for ${wallets.length} wallets (batch size: ${batchSize})`
    );

    const jobs = await this.stellarQueue.addBulk(
      batches.map((batch, index) => ({
        name: JOBS.STELLAR.INTERNAL_FAUCET_TRUSTLINE_QUEUE,
        data: {
          wallets: batch,
          batchInfo: {
            batchIndex: index + 1,
            totalBatches: batches.length,
            batchSize: batch.length,
            totalWallets: wallets.length,
          },
          beneficiaryGroupId,
        } as InternalFaucetBatchJob,
        opts: {
          attempts: 3,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          delay: index * 1000, // Stagger job execution slightly to avoid overwhelming the network
        },
      }))
    );

    this.logger.log(
      `Successfully added ${jobs.length} faucet and trustline batch jobs to queue`
    );

    return {
      message: `Created ${batches.length} batch jobs for ${wallets.length} wallets`,
      batchesCreated: batches.length,
      totalWallets: wallets.length,
      jobIds: jobs.map((job) => job.id),
    };
  }

  async addBulkToTokenTransferQueue(payload: FSPPayoutDetails[]) {
    const result = await this.stellarQueue.addBulk(
      payload.map((payload) => ({
        name: JOBS.STELLAR.TRANSFER_TO_OFFRAMP,
        data: payload,
        opts: {
          attempts: 3,
          removeOnComplete: true,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }))
    );

    this.logger.log(`Added ${result.length} jobs to offramp queue`);

    return result;
  }

  async addToTokenTransferQueue(payload: FSPPayoutDetails) {
    return await this.addBulkToTokenTransferQueue([payload]);
  }

  // ---------- Private functions ----------------

  private async getBatchSizeFromSettings(): Promise<number> {
    try {
      const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
      const settingsValue = settings?.value as Record<string, any>;
      const batchSize = settingsValue?.FAUCET_BATCH_SIZE;
      return batchSize && !isNaN(Number(batchSize)) ? Number(batchSize) : 3;
    } catch (error) {
      this.logger.warn(
        'Failed to get batch size from settings, using default value of 3'
      );
      return 3;
    }
  }

  private getBatchSize(): number {
    return 3; // Default batch size, used for synchronous calls
  }

  private createWalletBatches(wallets: any[], batchSize?: number): any[][] {
    const size = batchSize || this.getBatchSize();
    const batches: any[][] = [];

    for (let i = 0; i < wallets.length; i += size) {
      batches.push(wallets.slice(i, i + size));
    }

    return batches;
  }

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

  public async getBenTotal(phoneNumber: string) {
    try {
      const keys = await this.getSecretByPhone(phoneNumber);
      this.logger.log('Keys: ', keys);
      return this.getRahatBalance(keys.address);
    } catch (error) {
      throw new RpcException(error);
    }
  }

  // todo: Make chain dynamic
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
      throw new RpcException(
        `Cannot get secret of beneficiary with phone number: ${phoneNumber}`
      );
    }
  }

  // todo: Make chain dynamic
  public async getSecretByWallet(walletAddress: string) {
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
        `Cannot get secret of beneficiary with wallet address: ${walletAddress}`
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
        isVerified: false,
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

    if (record.isVerified) {
      this.logger.log('OTP already verified');
      throw new RpcException('OTP already verified');
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
    await this.prisma.otp.update({
      where: { phoneNumber },
      data: { isVerified: true },
    });

    return true;
  }

  private async getGroupsFromUuid(uuids: string[]) {
    if (!uuids || !uuids.length) {
      this.logger.warn('No UUIDs provided for group retrieval');
      return [];
    }
    const groups = await this.prisma.beneficiaryGroups.findMany({
      where: {
        uuid: {
          in: uuids,
        },
      },
      include: {
        tokensReserved: true,
      },
    });

    return groups;
  }

  private async getDisbursableGroupsUuids() {
    const benGroups = await this.prisma.beneficiaryGroupTokens.findMany({
      where: {
        AND: [
          {
            numberOfTokens: {
              gt: 0,
            },
          },
          { isDisbursed: false },
          {
            payout: {
              is: null,
            },
          },
        ],
      },
      select: { uuid: true, groupId: true },
    });
    return benGroups.map((group) => group.groupId);
  }

  private async getFromSettings(key: string) {
    const settings = await this.settingService.getPublic('STELLAR_SETTINGS');
    return settings?.value[key];
  }

  // todo: Make this dynamic for evm
  public async getRahatBalance(keys) {
    try {
      const accountBalances = await this.receiveService.getAccountBalance(keys);

      console.log(accountBalances, 'accountBalances');
      const assetCode = await this.getFromSettings('ASSETCODE');

      const rahatAsset = accountBalances?.find(
        (bal: any) => bal.asset_code === assetCode
      );

      if (!rahatAsset) {
        this.logger.error(`${assetCode} asset not found in account balances`);
        return 0;
      }

      this.logger.log(`${assetCode} asset balance:`, rahatAsset.balance);

      return Math.floor(parseFloat(rahatAsset?.balance || '0'));
    } catch (error) {
      this.logger.error(error.message);
      return 0;
    }
  }

  // todo: Make this dynamic for evm
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

      if (!beneficiary) {
        this.logger.error('Beneficiary not found');
        throw new RpcException('Beneficiary not found');
      }

      // Filter groupedBeneficiaries to only payout-eligible groups (not COMMUNICATION)
      const payoutEligibleGroups = beneficiary.groupedBeneficiaries.filter(
        (g) => g.groupPurpose !== 'COMMUNICATION'
      );

      if (!payoutEligibleGroups.length) {
        this.logger.error('No payout-eligible group found for beneficiary');
        throw new RpcException(
          'No payout-eligible group found for beneficiary'
        );
      }

      // Use the first payout-eligible group for the lookup
      const beneficiaryGroups = await this.prisma.beneficiaryGroups.findUnique({
        where: {
          uuid: payoutEligibleGroups[0].beneficiaryGroupId,
        },
        include: {
          tokensReserved: {
            include: {
              payout: true,
            },
          },
        },
      });

      if (!beneficiaryGroups) {
        this.logger.error('Beneficiary group not found');
        throw new RpcException('Beneficiary group not found');
      }

      if (!beneficiaryGroups.tokensReserved) {
        this.logger.error('Tokens not reserved for the group');
        throw new RpcException('Tokens not reserved for the group');
      }

      return beneficiaryGroups.tokensReserved.payout;
    } catch (error) {
      throw new RpcException(
        `Failed to retrieve payout type: ${error.message}`
      );
    }
  }
}
