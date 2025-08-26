import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import {
  BeneficiaryRedeem,
  Payouts,
  PayoutTransactionStatus,
  PayoutTransactionType,
  PayoutType,
  Prisma,
} from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { VendorsService } from '../vendors/vendors.service';
import { isUUID } from 'class-validator';
import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginatedResult } from '@rumsan/communication/types/pagination.types';
import {
  BeneficiaryPayoutDetails,
  DownloadPayoutLogsType,
  IPaymentProvider,
  PayoutStats,
} from './dto/types';
import { OfframpService } from './offramp.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import { FSPOfframpDetails, FSPPayoutDetails, FSPManualPayoutDetails } from '../processors/types';
import { StellarService } from '../stellar/stellar.service';
import { ListPayoutDto } from './dto/list-payout.dto';
import {
  calculatePayoutStatus,
  PayoutWithRelations,
  RedeemStatus,
} from '../utils/getBeneficiaryRedemStatus';
import { parseJsonField } from '../utils/parseJsonFields';
import { format } from 'date-fns';
import { AppService } from '../app/app.service';
import { lastValueFrom } from 'rxjs';
import { getFormattedTimeDiff } from '../utils/date';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

const ONE_TOKEN_VALUE = 1;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private prisma: PrismaService,
    private vendorsService: VendorsService,
    private offrampService: OfframpService,
    private stellarService: StellarService,
    private appService: AppService,
    private readonly beneficiaryService: BeneficiaryService
  ) {}

  /**
   * Find payout stats
   * This is used to find the payout stats including counts by payout type
   * and isCompleted status.
   */
  async getPayoutStats(): Promise<PayoutStats> {
    try {
      const [fspCount, vendorCount, failed, success, beneficiaryRedeems] =
        await Promise.all([
          this.prisma.beneficiaryRedeem.count({
            where: {
              transactionType: 'FIAT_TRANSFER',
              status: 'FIAT_TRANSACTION_COMPLETED',
            },
          }),
          this.prisma.beneficiaryRedeem.count({
            where: {
              transactionType: 'VENDOR_REIMBURSEMENT',
              status: 'COMPLETED',
            },
          }),
          this.prisma.beneficiaryRedeem.count({
            where: {
              status: {
                in: [
                  'FAILED',
                  'FIAT_TRANSACTION_FAILED',
                  'TOKEN_TRANSACTION_FAILED',
                ],
              },
            },
          }),
          this.prisma.beneficiaryRedeem.count({
            where: {
              status: {
                in: ['COMPLETED', 'FIAT_TRANSACTION_COMPLETED'],
              },
            },
          }),
          this.prisma.beneficiaryRedeem.findMany({
            where: {
              transactionType: {
                in: ['FIAT_TRANSFER', 'VENDOR_REIMBURSEMENT'],
              },
              status: {
                in: ['COMPLETED', 'FIAT_TRANSACTION_COMPLETED'],
              },
            },
          }),
        ]);

      const uniqueWallets = new Set(
        beneficiaryRedeems.flatMap((b) => b.beneficiaryWalletAddress)
      );

      const totalBeneficiaries = uniqueWallets.size;

      const totalTokens = beneficiaryRedeems.reduce(
        (acc, redeem) => acc + redeem.amount,
        0
      );

      return {
        payoutOverview: {
          payoutTypes: {
            FSP: fspCount,
            VENDOR: vendorCount,
          },
          payoutStatus: {
            SUCCESS: success,
            FAILED: failed,
          },
        },
        payoutStats: {
          beneficiaries: totalBeneficiaries,
          totalCashDistribution: totalTokens * ONE_TOKEN_VALUE,
        },
      };
    } catch (error) {
      console.error('Failed to fetch payout stats:', error);
      throw new Error('Failed to fetch payout stats');
    }
  }

  async create(payload: CreatePayoutDto): Promise<Payouts> {
    const { groupId, ...createPayoutDto } = payload;
    try {
      this.logger.log(
        `Creating new payout for group: ${JSON.stringify(createPayoutDto)}`
      );

      const beneficiaryGroup =
        await this.prisma.beneficiaryGroupTokens.findFirst({
          where: { uuid: groupId },
        });

      if (!beneficiaryGroup) {
        throw new RpcException(
          `Beneficiary group tokens with UUID '${groupId}' not found`
        );
      }
      const existingPayout = await this.prisma.payouts.findFirst({
        where: { beneficiaryGroupToken: { uuid: groupId } },
      });

      if (existingPayout) {
        throw new RpcException(
          `Payout with groupId '${groupId}' already exists`
        );
      }

      /*
       * FSP Payout is done by the Offramp service so
       * we need to check and store the payout processor id
       * it be either id for ConnectIPS, Khalti and so on
       */

      //TODO validate bankdetails of the beneficiary
      if (createPayoutDto.type === 'FSP') {
        if (!createPayoutDto.payoutProcessorId) {
          throw new RpcException(
            `Payout processor ID is required for FSP payout`
          );
        }
      } else {
        /*
         * Offline Payout is done by the vendor so
         * we need to check and store the payout processor id which is vendor id
         * If the 'type' is Vendor and mode is OFFLINE
         */
        if (createPayoutDto.mode === 'OFFLINE') {
          if (!createPayoutDto.payoutProcessorId) {
            throw new RpcException(
              `Payout processor ID is required for OFFLINE payout`
            );
          }

          if (!isUUID(createPayoutDto.payoutProcessorId)) {
            throw new RpcException(`Payout processor ID is not a valid UUID`);
          }

          const vendor = await this.vendorsService.findOne(
            createPayoutDto.payoutProcessorId
          );

          if (!vendor) {
            throw new RpcException(
              `Vendor with ID '${createPayoutDto.payoutProcessorId}' not found`
            );
          }
        }
      }

      const payout = await this.prisma.payouts.create({
        data: {
          ...createPayoutDto,
          beneficiaryGroupToken: {
            connect: { uuid: groupId },
          },
        },
      });

      if (createPayoutDto.payoutProcessorId === 'manual-bank-transfer') {
        this.logger.log(`Processing manual bank transfer payout for UUID: ${payout.uuid}`);
        
        const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(
          payout.uuid
        );
        
        const manualPayoutDetails: FSPManualPayoutDetails[] =
          BeneficiaryPayoutDetails.map((beneficiary) => ({
            amount: beneficiary.amount,
            beneficiaryWalletAddress: beneficiary.walletAddress,
            beneficiaryBankDetails: beneficiary.bankDetails,
            payoutUUID: payout.uuid,
            payoutProcessorId: createPayoutDto.payoutProcessorId,
            beneficiaryPhoneNumber: beneficiary.phoneNumber,
          }));

        await this.offrampService.addToManualPayoutQueue(manualPayoutDetails);
        
        this.logger.log(`Manual bank transfer queue added for payout UUID: ${payout.uuid}`);
      }

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      return payout;
    } catch (error) {
      this.logger.error(
        `Failed to create payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async findAll(
    payload: ListPayoutDto
  ): Promise<PaginatedResult<Omit<PayoutWithRelations, 'beneficiaryRedeem'>>> {
    try {
      const { page, perPage, groupName, payoutType } = payload;

      this.logger.log('Fetching all payouts');
      const where: Prisma.PayoutsWhereInput = {
        ...(groupName && {
          beneficiaryGroupToken: {
            beneficiaryGroup: {
              name: {
                contains: groupName,
                mode: 'insensitive',
              },
            },
          },
        }),
        ...(payoutType &&
          Object.values(PayoutType).includes(payoutType as PayoutType) && {
            type: payoutType as PayoutType,
          }),
      };

      const query: Prisma.PayoutsFindManyArgs = {
        where,
        include: {
          beneficiaryGroupToken: {
            select: {
              uuid: true,
              status: true,
              numberOfTokens: true,
              isDisbursed: true,
              createdBy: true,
              beneficiaryGroup: {
                select: {
                  name: true,
                  tokensReserved: {
                    select: {
                      numberOfTokens: true,
                      isDisbursed: true,
                      payoutId: true,
                      id: true,
                      uuid: true,
                      title: true,
                      status: true,
                      groupId: true,
                      createdBy: true,
                      createdAt: true,
                      updatedAt: true,
                    },
                  },
                  groupPurpose: true,
                  id: true,
                  uuid: true,
                  _count: {
                    select: { beneficiaries: true },
                  },
                },
              },
            },
          },
          beneficiaryRedeem: {
            select: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      };

      const result = await paginate(this.prisma.payouts, query, {
        page: page,
        perPage: perPage,
      });

      const enrichedData = await Promise.all(
        result.data.map(async (eachPayout: PayoutWithRelations) => {
          //  Skip calculation if already completed
          if (eachPayout.status === 'COMPLETED') {
            return {
              ...eachPayout,
              totalSuccessAmount:
                eachPayout.beneficiaryGroupToken.numberOfTokens *
                ONE_TOKEN_VALUE,
            };
          }
          const calculatedStatus = calculatePayoutStatus(eachPayout);
          await this.syncPayoutStatus(eachPayout, calculatedStatus);

          let totalSuccessAmount = 0;

          if (calculatedStatus === 'COMPLETED') {
            totalSuccessAmount =
              eachPayout.beneficiaryGroupToken.numberOfTokens * ONE_TOKEN_VALUE;
          } else if (eachPayout.type === 'FSP') {
            const successRequests = eachPayout.beneficiaryRedeem.filter(
              (redeem) => redeem.status === 'FIAT_TRANSACTION_COMPLETED'
            );

            const eachBeneficiaryTokenCount =
              eachPayout.beneficiaryGroupToken.numberOfTokens /
              eachPayout.beneficiaryGroupToken.beneficiaryGroup._count
                .beneficiaries;

            totalSuccessAmount =
              successRequests.length *
              ONE_TOKEN_VALUE *
              eachBeneficiaryTokenCount;
          } else {
            const successRequests = eachPayout.beneficiaryRedeem.filter(
              (redeem) => redeem.status === 'COMPLETED'
            );

            const eachBeneficiaryTokenCount =
              eachPayout.beneficiaryGroupToken.numberOfTokens /
              eachPayout.beneficiaryGroupToken.beneficiaryGroup._count
                .beneficiaries;

            totalSuccessAmount =
              successRequests.length *
              ONE_TOKEN_VALUE *
              eachBeneficiaryTokenCount;
          }

          // Remove beneficiaryRedeem from result, add redeemStatus
          const { beneficiaryRedeem, ...rest } = eachPayout;
          return {
            ...rest,
            totalSuccessAmount,
          };
        })
      );

      this.logger.log(
        `Successfully fetched and synced ${enrichedData.length} payouts`
      );

      return {
        ...result,
        data: enrichedData,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch payouts: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  //  Sync payout status in DB if changed, and update object
  async syncPayoutStatus(
    payout: PayoutWithRelations,
    newStatus: RedeemStatus
  ): Promise<void> {
    if (payout.status !== newStatus) {
      await this.prisma.payouts.update({
        where: { uuid: payout.uuid },
        data: { status: newStatus },
      });
      payout.status = newStatus;
    }
  }

  /**
   * Find one payout
   * This is used to find one payout by UUID
   *
   * @param uuid - The UUID of the payout
   * @returns { Payouts & { beneficiaryGroupToken?: { numberOfTokens?: number; beneficiaryGroup?: { beneficiaries?: any[]; }; }; } } - The payout
   */
  async findOne(uuid: string): Promise<
    Payouts & {
      beneficiaryGroupToken?: {
        numberOfTokens?: number;
        info?: any;
        beneficiaryGroup?: {
          beneficiaries?: any[];
        };
      };
      beneficiaryRedeem?: BeneficiaryRedeem[];
      isCompleted?: boolean;
      hasFailedPayoutRequests?: boolean;
      isPayoutTriggered?: boolean;
      totalSuccessRequests?: number;
      payoutGap?: string;
      totalSuccessAmount?: number;
      totalFailedPayoutRequests?: number;
    }
  > {
    try {
      this.logger.log(`Fetching payout with UUID: '${uuid}'`);

      const payout = await this.prisma.payouts.findUnique({
        where: { uuid },
        include: {
          beneficiaryRedeem: true,
          beneficiaryGroupToken: {
            include: {
              beneficiaryGroup: {
                include: {
                  beneficiaries: {
                    include: {
                      beneficiary: {
                        select: {
                          uuid: true,
                          walletAddress: true,
                          extras: true,
                          phone: true,
                        },
                      },
                    },
                  },
                  _count: {
                    select: {
                      beneficiaries: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!payout) {
        this.logger.warn(`Payout not found with UUID: '${uuid}'`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }
      const calculatedStatus = calculatePayoutStatus(payout);
      await this.syncPayoutStatus(payout, calculatedStatus);
      const failedPayoutRequests =
        await this.beneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID(
          uuid
        );

      const totalFailedPayoutRequests = failedPayoutRequests.reduce(
        (acc, curr) => acc + curr.count,
        0
      );

      const isCompleted = await this.getPayoutCompletedStatus(payout);
      const isPayoutTriggered = payout.beneficiaryRedeem.length > 0;
      const eachBenfTokenCount = isPayoutTriggered
        ? payout.beneficiaryGroupToken.numberOfTokens /
          payout.beneficiaryGroupToken.beneficiaryGroup._count.beneficiaries
        : 0;

      let totalSuccessRequests = 0;
      if (isPayoutTriggered) {
        if (isCompleted) {
          totalSuccessRequests =
            payout.beneficiaryGroupToken.beneficiaryGroup._count.beneficiaries;
        } else {
          const count =
            payout.type === 'FSP'
              ? payout.beneficiaryRedeem.reduce((acc, curr) => {
                  if (curr.status === 'FIAT_TRANSACTION_COMPLETED') {
                    acc++;
                  }
                  return acc;
                }, 0)
              : payout.beneficiaryRedeem.reduce((acc, curr) => {
                  if (curr.status === 'COMPLETED') {
                    acc++;
                  }
                  return acc;
                }, 0);

          if (count < 1) {
            totalSuccessRequests = 0;
          } else {
            totalSuccessRequests = count;
          }
        }
      }

      let payoutGap = 'N/A';

      if (isCompleted && isPayoutTriggered) {
        payoutGap = await this.calculatePayoutCompletionGap(uuid);
      }

      return {
        ...payout,
        hasFailedPayoutRequests:
          payout.type === 'VENDOR' ? false : totalFailedPayoutRequests > 0,
        totalSuccessAmount:
          totalSuccessRequests * ONE_TOKEN_VALUE * eachBenfTokenCount,
        totalSuccessRequests,
        totalFailedPayoutRequests,
        payoutGap,
        isCompleted,
        isPayoutTriggered,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getOne(uuid: string): Promise<any> {
    try {
      const { beneficiaryRedeem, beneficiaryGroupToken, ...rest } =
        await this.findOne(uuid);
      const {
        beneficiaryGroup: { beneficiaries, ...otherData },
        ...tokenData
      } = beneficiaryGroupToken;

      delete tokenData.info;

      return {
        ...rest,
        beneficiaryGroupToken: {
          ...tokenData,
          beneficiaryGroup: {
            ...otherData,
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  async getPayoutCompletedStatus(
    payout: Payouts & {
      beneficiaryRedeem: BeneficiaryRedeem[];
      beneficiaryGroupToken?: {
        numberOfTokens?: number;
        beneficiaryGroup?: {
          beneficiaries?: any[];
        };
      };
    }
  ): Promise<boolean> {
    if (payout.type === 'VENDOR') {
      return (
        payout.beneficiaryRedeem.length > 0 &&
        payout.beneficiaryRedeem.length ===
          payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length &&
        payout.beneficiaryRedeem.every((r) => r.isCompleted)
      );
    }

    return (
      payout.beneficiaryRedeem.length > 0 &&
      payout.beneficiaryRedeem.length ===
        payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length *
          2 &&
      payout.beneficiaryRedeem.every((r) => r.isCompleted)
    );
  }

  async update(
    uuid: string,
    updatePayoutDto: UpdatePayoutDto
  ): Promise<Payouts> {
    try {
      this.logger.log(`Updating payout with UUID: '${uuid}'`);

      const existingPayout = await this.prisma.payouts.findUnique({
        where: { uuid },
      });

      if (!existingPayout) {
        this.logger.warn(`Payout not found with UUID: ${uuid}`);
        throw new RpcException(`Payout with UUID '${uuid}' not found`);
      }

      const updatedPayout = await this.prisma.payouts.update({
        where: { uuid },
        data: updatePayoutDto,
      });

      this.logger.log(`Successfully updated payout with UUID: '${uuid}'`);
      return updatedPayout;
    } catch (error) {
      this.logger.error(
        `Failed to update payout: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  // fetch addresses
  async fetchBeneficiaryPayoutDetails(
    uuid: string
  ): Promise<BeneficiaryPayoutDetails[]> {
    this.logger.log(
      `Fetching beneficiary wallet addresses for payout with UUID: '${uuid}'`
    );

    const payout = await this.findOne(uuid);

    if (!payout.beneficiaryGroupToken?.beneficiaryGroup?.beneficiaries) {
      this.logger.warn(
        `No beneficiaries found for payout with UUID: '${uuid}'`
      );
      return [];
    }

    //   "bank_name": "0401",
    // "bank_ac_name": "Ankit Neupane",
    // "bank_ac_number": "08110017501011"
    const numberOfTokensToTransfer =
      payout.beneficiaryGroupToken.numberOfTokens /
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length;

    // Extract the wallet addresses and bank-details from each beneficiary
    const BeneficiaryPayoutDetails =
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries
        .map((benfToGroup) => {
          return {
            amount: numberOfTokensToTransfer,
            walletAddress: benfToGroup.beneficiary?.walletAddress,
            phoneNumber:
              benfToGroup.beneficiary?.phone ||
              benfToGroup.beneficiary?.extras?.phone,
            bankDetails: {
              accountName: benfToGroup.beneficiary?.extras?.bank_ac_name || '',
              accountNumber:
                benfToGroup.beneficiary?.extras?.bank_ac_number || '',
              bankName: benfToGroup.beneficiary?.extras?.bank_name || '',
            },
          };
        })
        .filter((address) => address.walletAddress); // Filter out any undefined or null addresses
    // Check if any wallet addresses are null or undefined after filtering
    if (
      BeneficiaryPayoutDetails.length !==
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length
    ) {
      this.logger.error(
        `Some beneficiaries have null or undefined wallet addresses for payout with UUID: '${uuid}'`
      );
      throw new RpcException(
        'Some beneficiaries have missing wallet addresses'
      );
    }

    this.logger.log(
      `Successfully fetched ${BeneficiaryPayoutDetails.length} wallet addresses for payout with UUID: '${uuid}'`
    );
    return BeneficiaryPayoutDetails;
  }

  async getPaymentProvider(): Promise<IPaymentProvider[]> {
    return this.offrampService.getPaymentProvider();
  }

  async registerTokenTransferRequest(payload: {
    uuid: string;
    offrampWalletAddress: string;
    BeneficiaryPayoutDetails: BeneficiaryPayoutDetails[];
    payoutProcessorId: string;
    offrampType: string;
  }) {
    const {
      uuid,
      offrampWalletAddress,
      BeneficiaryPayoutDetails,
      payoutProcessorId,
      offrampType,
    } = payload;

    const stellerOfframpQueuePayload: FSPPayoutDetails[] =
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: uuid,
        payoutProcessorId: payoutProcessorId,
        offrampWalletAddress,
        offrampType,
      }));

    const d = await this.stellarService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );

    return d;
  }

  async triggerPayout(uuid: string): Promise<any> {
    //TODO: verify trustline of beneficiary wallet addresses
    const payoutDetails = await this.findOne(uuid);
    if (payoutDetails.isPayoutTriggered) {
      throw new RpcException(
        `Payout with UUID '${uuid}' has already been triggered`
      );
    }

    // Check if this is a manual bank transfer payout - these cannot be triggered
    if (payoutDetails.payoutProcessorId === 'manual-bank-transfer') {
      throw new RpcException(
        `Manual bank transfer payouts cannot be triggered. They are processed automatically upon creation.`
      );
    }

    const payoutExtras = payoutDetails.extras as {
      paymentProviderType: string;
      paymentProviderName: string;
    };

    const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(
      uuid
    );

    // Handle regular FSP payouts (existing logic)
    const offrampWalletAddress =
      await this.offrampService.getOfframpWalletAddress();

    const stellerOfframpQueuePayload: FSPPayoutDetails[] =
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: uuid,
        payoutProcessorId: payoutDetails.payoutProcessorId,
        beneficiaryPhoneNumber: beneficiary.phoneNumber,
        offrampWalletAddress,
        offrampType: payoutExtras.paymentProviderType,
      }));

    await this.stellarService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );

    return 'Payout Initiated Successfully';
  }

  async triggerOneFailedPayoutRequest(payload: {
    beneficiaryRedeemUuid: string;
    // payoutUUID: string;
  }): Promise<any> {
    const { beneficiaryRedeemUuid } = payload;

    this.logger.log(
      `Triggering payout for failed request with UUID: ${beneficiaryRedeemUuid}`
    );
    try {
      const benfRedeemRequest =
        await this.beneficiaryService.getBeneficiaryRedeem(
          beneficiaryRedeemUuid
        );

      if (!benfRedeemRequest) {
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`
        );
      }

      if (benfRedeemRequest.isCompleted)
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already completed`
        );

      const transactionType = benfRedeemRequest.transactionType;

      if (transactionType === 'VENDOR_REIMBURSEMENT')
        throw new RpcException(
          `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`
        );

      if (transactionType === 'TOKEN_TRANSFER') {
        if (benfRedeemRequest.status === 'TOKEN_TRANSACTION_INITIATED') {
          throw new RpcException(
            `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already initiated`
          );
        }
        return await this.processOneFailedTokenTransferPayout({
          beneficiaryRedeemUuid,
        });
      }
      if (transactionType === 'FIAT_TRANSFER') {
        if (benfRedeemRequest.status === 'FIAT_TRANSACTION_INITIATED') {
          throw new RpcException(
            `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already initiated`
          );
        }
        return await this.processOneFailedFiatPayout({
          beneficiaryRedeemUuid,
        });
      }

      throw new RpcException(
        `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`
      );
    } catch (error) {
      this.logger.error(
        `Failed to trigger payout for failed request: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Trigger a failed payout request
   * This is used to trigger a failed payout request for a payout
   *
   * @param payload - The payload containing the payout UUID
   * @returns { message: string } - The result of the trigger
   */
  async triggerFailedPayoutRequest(payload: { payoutUUID: string }) {
    try {
      const { payoutUUID } = payload;

      if (!payoutUUID) {
        throw new RpcException(
          'Payout UUID is required for failed payout request'
        );
      }

      const payout = await this.findOne(payoutUUID);
      if (!payout) {
        throw new RpcException(
          `Payout with UUID '${payoutUUID}' not found for failed payout request`
        );
      }

      if (!payout.isPayoutTriggered) {
        throw new RpcException(
          `Payout with UUID '${payoutUUID}' has not been triggered`
        );
      }

      const result =
        await this.beneficiaryService.getFailedBeneficiaryRedeemByPayoutUUID(
          payoutUUID
        );

      const failedFiatRecords = result.find(
        (r) => r.status === 'FIAT_TRANSACTION_FAILED'
      ) || {
        status: 'FIAT_TRANSACTION_FAILED',
        count: 0,
        beneficiaryRedeems: [],
      };
      const failedTokenRecords = result.find(
        (r) => r.status === 'TOKEN_TRANSACTION_FAILED'
      ) || {
        status: 'TOKEN_TRANSACTION_FAILED',
        count: 0,
        beneficiaryRedeems: [],
      };

      if (!failedFiatRecords.count && !failedTokenRecords.count) {
        return {
          message: `No failed fiat or token payouts found for payout with UUID '${payoutUUID}'`,
        };
      }

      this.logger.log(`Failed fiat payouts: ${failedFiatRecords.count}`);
      this.logger.log(`Failed token payouts: ${failedTokenRecords.count}`);

      const failedFiatPayouts = await this.createBulkFailedRequestPayout(
        failedFiatRecords.beneficiaryRedeems.map((r) => r.uuid)
      );

      const failedTokenPayouts = await this.createBulkFailedRequestPayout(
        failedTokenRecords.beneficiaryRedeems.map((r) => r.uuid)
      );

      await this.offrampService.addBulkToOfframpQueue(failedFiatPayouts);

      await this.stellarService.addBulkToTokenTransferQueue(failedTokenPayouts);

      await this.beneficiaryService.updateBeneficiaryRedeemBulk(
        failedFiatRecords.beneficiaryRedeems.map((r) => r.uuid),
        {
          status: 'FIAT_TRANSACTION_INITIATED',
        }
      );

      await this.beneficiaryService.updateBeneficiaryRedeemBulk(
        failedTokenRecords.beneficiaryRedeems.map((r) => r.uuid),
        {
          status: 'TOKEN_TRANSACTION_INITIATED',
        }
      );

      return {
        message: `Processing ${failedFiatRecords.count} failed fiat payouts and ${failedTokenRecords.count} failed token payouts`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to trigger failed payout request: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Get payout logs
   * This is used to get payout logs for a payout
   *
   * @param payload - The payload containing the payout UUID, transaction type, transaction status, page, perPage, sort, and order
   * @returns { any } - The payout logs
   */
  async getPayoutLogs(payload: GetPayoutLogsDto) {
    const {
      payoutUUID,
      transactionType,
      transactionStatus,
      page,
      perPage,
      sort,
      order,
      search,
    } = payload;

    this.logger.log(`Getting payout logs for payout with UUID: ${payoutUUID}`);
    try {
      const payout = await this.prisma.payouts.findFirst({
        where: {
          uuid: payoutUUID,
        },
      });

      if (!payout) {
        throw new RpcException(`Payout with UUID '${payoutUUID}' not found`);
      }

      if (payout.type === 'VENDOR') {
        const query: Prisma.BeneficiaryRedeemFindManyArgs = {
          where: {
            ...(payoutUUID && { payoutId: payoutUUID }),
            ...(transactionType && { transactionType }),
            ...(transactionStatus && { status: transactionStatus }),
            ...(search && {
              OR: [
                {
                  beneficiaryWalletAddress: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  txHash: { contains: search, mode: 'insensitive' },
                },
                {
                  info: {
                    path: ['error'],
                    string_contains: search,
                  },
                },
                {
                  Vendor: {
                    walletAddress: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  Beneficiary: {
                    phone: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }),
          },
          ...(sort && {
            orderBy: {
              [sort]: order,
            },
          }),
        };

        const logs = await paginate(
          this.prisma.beneficiaryRedeem,
          {
            ...query,
          },
          {
            page,
            perPage,
          }
        );
        return logs;
      }

      if (payout.type === 'FSP') {
        const allRedeems = await this.prisma.beneficiaryRedeem.findMany({
          where: {
            payoutId: payoutUUID,
            ...(transactionType && { transactionType }),
            ...(transactionStatus && { status: transactionStatus }),
            ...(search && {
              OR: [
                {
                  beneficiaryWalletAddress: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  txHash: { contains: search, mode: 'insensitive' },
                },
                {
                  info: {
                    path: ['error'],
                    string_contains: search,
                  },
                },
                {
                  Vendor: {
                    walletAddress: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  Beneficiary: {
                    phone: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }),
          },
          include: {
            Beneficiary: true,
            Vendor: true,
            payout: true,
          },
        });

        // Group by beneficiary wallet address
        const redeemsByWallet = allRedeems.reduce((acc, redeem) => {
          const walletAddress = redeem.beneficiaryWalletAddress;
          if (!acc[walletAddress]) {
            acc[walletAddress] = {
              TOKEN_TRANSFER: null,
              FIAT_TRANSFER: null,
            };
          }
          acc[walletAddress][redeem.transactionType] = redeem;
          return acc;
        }, {});

        // - If FIAT_TRANSFER exists, include it and exclude TOKEN_TRANSFER
        // - If FIAT_TRANSFER doesn't exist, include TOKEN_TRANSFER
        const filteredRedeems = [];
        for (const walletAddress in redeemsByWallet) {
          const walletRedeems = redeemsByWallet[walletAddress];
          if (walletRedeems.FIAT_TRANSFER) {
            filteredRedeems.push(walletRedeems.FIAT_TRANSFER);
          } else if (walletRedeems.TOKEN_TRANSFER) {
            if (
              walletRedeems.TOKEN_TRANSFER.status !==
              'TOKEN_TRANSACTION_COMPLETED'
            ) {
              filteredRedeems.push(walletRedeems.TOKEN_TRANSFER);
            }
          }
        }

        const total = filteredRedeems.length;
        const pageNumber = page || 1;
        const itemsPerPage = perPage || 10;
        const offset = (pageNumber - 1) * itemsPerPage;
        const paginatedRedeems = filteredRedeems.slice(
          offset,
          offset + itemsPerPage
        );

        return {
          data: paginatedRedeems,
          meta: {
            total,
            lastPage: Math.ceil(total / itemsPerPage),
            currentPage: pageNumber,
            perPage: itemsPerPage,
            prev: pageNumber > 1 ? pageNumber - 1 : null,
            next:
              pageNumber < Math.ceil(total / itemsPerPage)
                ? pageNumber + 1
                : null,
          },
        };
      }

      throw new RpcException(`Unsupported payout type: ${payout.type}`);
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  /**
   * Get a payout log
   * This is used to get a payout log for a beneficiary redeem
   *
   * @param uuid - The UUID of the beneficiary redeem request
   * @returns { BeneficiaryRedeem } - The payout log
   */
  async getPayoutLog(uuid: string): Promise<any> {
    this.logger.log(
      `Getting payout log for beneficiary redeem with UUID: ${uuid}`
    );
    try {
      const log = await this.prisma.beneficiaryRedeem.findUnique({
        where: {
          uuid,
        },
        include: {
          Beneficiary: true,
          payout: true,
          Vendor: true,
        },
      });

      if (!log) {
        throw new RpcException(
          `Beneficiary redeem log with UUID '${uuid}' not found`
        );
      }

      return log;
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }

  /**
   * Process a failed fiat payout
   * This is used to process a failed fiat payout for a beneficiary redeem
   *
   * @param payload - The payload containing the beneficiary redeem UUID
   * @returns { success: boolean, message: string } - The result of the process
   */
  async processOneFailedFiatPayout(payload: { beneficiaryRedeemUuid: string }) {
    try {
      const { beneficiaryRedeemUuid } = payload;

      const offrampQueuePayload = await this.createFailedRequestPayout(
        beneficiaryRedeemUuid
      );

      await this.offrampService.addToOfframpQueue(offrampQueuePayload);

      await this.beneficiaryService.updateBeneficiaryRedeem(
        beneficiaryRedeemUuid,
        {
          status: 'FIAT_TRANSACTION_INITIATED',
        }
      );

      this.logger.log(
        `Added to offramp queue for beneficiary redeem with UUID: ${beneficiaryRedeemUuid}`
      );

      return {
        success: true,
        message: 'Fiat payout triggered successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to process one failed fiat payout: ${error.message}`,
        error.stack
      );

      throw new RpcException(error.message);
    }
  }

  /**
   * Process a failed token transfer payout
   * This is used to process a failed token transfer payout for a beneficiary redeem
   *
   * @param payload - The payload containing the beneficiary redeem UUID
   * @returns { success: boolean, message: string } - The result of the process
   */
  async processOneFailedTokenTransferPayout(payload: {
    beneficiaryRedeemUuid: string;
  }) {
    const { beneficiaryRedeemUuid } = payload;

    const offrampQueuePayload = await this.createFailedRequestPayout(
      beneficiaryRedeemUuid
    );

    await this.stellarService.addToTokenTransferQueue(offrampQueuePayload);

    // update the beneficiary redeem status to pending
    await this.beneficiaryService.updateBeneficiaryRedeem(
      beneficiaryRedeemUuid,
      {
        status: 'TOKEN_TRANSACTION_INITIATED',
      }
    );

    this.logger.log(
      `Added to token transfer queue for beneficiary redeem with UUID: ${beneficiaryRedeemUuid}`
    );
    return {
      success: true,
      message: 'Token transfer triggered successfully',
    };
  }

  /**
   * Create a bulk failed request payout
   * This is used to create a bulk failed request payout for a beneficiary redeem
   *
   * @param beneficiaryRedeemUuids - The UUIDs of the beneficiary redeem requests
   * @returns (FSPPayoutDetails | FSPOfframpDetails)[] - The bulk failed request payout
   */
  private async createBulkFailedRequestPayout(
    beneficiaryRedeemUuids: string[]
  ): Promise<(FSPPayoutDetails | FSPOfframpDetails)[]> {
    const res = await Promise.all(
      beneficiaryRedeemUuids.map(async (uuid) => {
        const benfRedeemRequest = await this.createFailedRequestPayout(uuid);

        return benfRedeemRequest;
      })
    );

    return res.filter((r) => r !== null);
  }

  /**
   * Create a failed request payout
   * This is used to create a failed request payout for a beneficiary redeem
   *
   * @param beneficiaryRedeemUuid - The UUID of the beneficiary redeem request
   * @returns FSPPayoutDetails | FSPOfframpDetails
   */
  private async createFailedRequestPayout(
    beneficiaryRedeemUuid: string
  ): Promise<FSPPayoutDetails | FSPOfframpDetails> {
    const benfRedeemRequest =
      await this.beneficiaryService.getBeneficiaryRedeem(beneficiaryRedeemUuid);

    if (!benfRedeemRequest) {
      throw new RpcException(
        `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`
      );
    }

    const benfExtras = benfRedeemRequest.Beneficiary.extras as {
      bank_ac_name: string;
      bank_ac_number: string;
      bank_name: string;
    };

    const info = benfRedeemRequest.info as {
      offrampWalletAddress: string;
      beneficiaryWalletAddress: string;
      numberOfAttempts: number;
      transactionHash?: string;
      offrampType: string;
      error: string;
    };

    // check if offrampWalletAddress is in the info
    if (!info.offrampWalletAddress) {
      throw new RpcException(
        `Offramp wallet address not found for beneficiary redeem request with UUID '${beneficiaryRedeemUuid}'`
      );
    }

    const beneficiaryPhoneNumber =
      benfRedeemRequest.Beneficiary.phone ||
      (benfRedeemRequest.Beneficiary.extras as any)?.phone;

    const offrampQueuePayload: FSPOfframpDetails = {
      amount: benfRedeemRequest.amount,
      offrampType: info.offrampType,
      beneficiaryBankDetails: {
        accountName: benfExtras.bank_ac_name,
        accountNumber: benfExtras.bank_ac_number,
        bankName: benfExtras.bank_name,
      },
      beneficiaryPhoneNumber,
      beneficiaryWalletAddress: benfRedeemRequest.beneficiaryWalletAddress,
      offrampWalletAddress: info.offrampWalletAddress,
      payoutUUID: benfRedeemRequest.payoutId,
      payoutProcessorId: benfRedeemRequest.fspId,
      transactionHash: info?.transactionHash || null,
      beneficiaryRedeemUUID: benfRedeemRequest.uuid,
    };
    return offrampQueuePayload;
  }

  /**
   * Calculate the payout completion gap
   * From the triggerness of activation phase to the completion of the last payout request.
   *
   * @param payout - The payout
   * @returns { number } - The payout completion gap
   */
  async calculatePayoutCompletionGap(payoutUuid: string) {
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

      return 'N/A';
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

      return 'N/A';
    }

    if (!activationPhase.isActive) {
      this.logger.warn(
        `Activation phase is not active for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return 'N/A';
    }

    const activatedAt = new Date(activationPhase.activatedAt);
    const payoutLastLog = await this.prisma.beneficiaryRedeem.findFirst({
      where: { payout: { uuid: payoutUuid } },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!payoutLastLog) {
      this.logger.warn(
        `Payout last log not found for payout with UUID ${payoutUuid}`
      );
    }

    const diffInMs =
      new Date(payoutLastLog.updatedAt).getTime() - activatedAt.getTime();

    console.log(`Payout completion gap in ms: ${diffInMs}`);

    return getFormattedTimeDiff(diffInMs);
  }

  async downloadPayoutLogs(uuid: string): Promise<DownloadPayoutLogsType[]> {
    this.logger.log(
      `Getting payout log for beneficiary redeem with UUID: ${uuid}`
    );
    try {
      const log = await this.prisma.payouts.findUnique({
        where: { uuid },
        include: {
          beneficiaryRedeem: {
            include: {
              Beneficiary: true,
              payout: true,
              Vendor: true,
            },
          },
          beneficiaryGroupToken: {
            select: {
              numberOfTokens: true,
              status: true,
            },
          },
        },
      });

      if (!log) {
        throw new RpcException(
          `Beneficiary redeem log with UUID '${uuid}' not found`
        );
      }

      const result = log.beneficiaryRedeem.map((redeemLog) => {
        const extras = parseJsonField(redeemLog.Beneficiary?.extras);
        const info = parseJsonField(redeemLog.info);

        const payoutType = redeemLog.payout?.type;
        const payoutMode = redeemLog.payout?.mode;

        const base = {
          'Beneficiary Wallet Address': redeemLog.beneficiaryWalletAddress,
          'Phone number': extras?.phone || '',
          'Transaction Wallet ID': redeemLog.txHash || '',
          'Transaction Hash': info?.transactionHash || '',
          'Payout Status': redeemLog.payout?.status || '',
          'Transaction Type': redeemLog.transactionType || '',
          'Created At': redeemLog.createdAt
            ? format(new Date(redeemLog.createdAt), 'yyyy-MM-dd HH:mm')
            : '',
          'Updated At': redeemLog.updatedAt
            ? format(new Date(redeemLog.updatedAt), 'yyyy-MM-dd HH:mm')
            : '',
          'Actual Budget':
            log.beneficiaryGroupToken.numberOfTokens * ONE_TOKEN_VALUE,
          'Amount Disbursed':
            redeemLog.payout?.status === 'FAILED'
              ? 0
              : (redeemLog.Beneficiary?.benTokens || 0) * ONE_TOKEN_VALUE,
        };

        if (payoutType === 'FSP') {
          return {
            ...base,
            'Bank a/c name': extras?.bank_ac_name || '',
            'Bank a/c number': extras?.bank_ac_number || '',
            'Bank Name': extras?.bank_name || '',
          };
        } else {
          return base;
        }
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      throw new RpcException(error.message);
    }
  }
}
