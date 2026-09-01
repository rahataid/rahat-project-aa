import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import {
  BeneficiaryRedeem,
  GroupPurpose,
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
  ManualPayoutRowData,
  ManualPayoutMatchBy,
  EnrichedManualPayoutRow,
  ManualPayoutVerificationResult,
  EntityConfig,
  PayoutWithBeneficiaryDetails,
} from './dto/types';
import { OfframpService } from './offramp.service';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE, EVENTS, JOBS } from '../constants';
import { BeneficiaryService } from '../beneficiary/beneficiary.service';
import { GetPayoutLogsDto } from './dto/get-payout-logs.dto';
import {
  FSPOfframpDetails,
  FSPPayoutDetails,
  FSPManualPayoutDetails,
  ManualPayoutBatchTransferDto,
} from '../processors/types';
import { StellarTransferService } from '../stellar-transfer/stellar-transfer.service';
import { ListPayoutDto } from './dto/list-payout.dto';
import { OtpService } from '../otp/otp.service';
import bcrypt from 'bcryptjs';
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '@rumsan/settings';
import { ethers } from 'ethers';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 10 });

export const ONE_TOKEN_VALUE = 1;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private prisma: PrismaService,
    @Inject(forwardRef(() => VendorsService))
    private vendorsService: VendorsService,
    private offrampService: OfframpService,
    private readonly stellarTransferService: StellarTransferService,
    private readonly eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private appService: AppService,
    @Inject(forwardRef(() => BeneficiaryService))
    private readonly beneficiaryService: BeneficiaryService,
    private settingService: SettingsService,
    private readonly otpService: OtpService,
    @InjectQueue(BQUEUE.BATCH_TRANSFER)
    private readonly batchTransferQueue: Queue
  ) {}

  async sendOtp(email: string) {
    if (!email) {
      throw new RpcException({
        message: 'Email is required to send OTP',
        code: 'EMAIL_REQUIRED_TO_SEND_OTP',
      });
    }

    const defaultOpt = await this.prisma.otp.findUnique({ where: { email } });

    const isExistingValid =
      defaultOpt?.otp && defaultOpt.expiresAt > new Date();

    // if existing OTP is expired, purge it so we can issue a fresh one
    if (defaultOpt && !isExistingValid) {
      await this.prisma.otp.delete({ where: { email } });
    }

    const { otp } = await this.otpService.sendEmail(
      email,
      'Payout Trigger OTP',
      'Your OTP for triggering payout is:',
      isExistingValid ? defaultOpt.otp : undefined
    );

    // if otp is set in db and not expired, do not update otp, just resend the existing otp
    if (isExistingValid) {
      return { success: true, message: 'OTP sent successfully' };
    }

    const expiry = new Date(Date.now() + 50 * 60 * 1000); // OTP valid for 50 minutes
    const otpHash = await bcrypt.hash(otp, 10);
    await this.prisma.otp.create({
      data: {
        otpHash,
        otp,
        email,
        expiresAt: expiry,
        amount: 0,
      },
    });

    this.logger.log(`Payout OTP sent to email: ${email}`);
    return { success: true, message: 'OTP sent successfully' };
  }

  private async verifyOtp(email?: string, otp?: string) {
    if (!email || !otp) {
      throw new RpcException({
        message: 'Email and OTP are required',
        code: 'EMAIL_AND_OTP_REQUIRED',
      });
    }

    const otpRecord = await this.prisma.otp.findUnique({ where: { email } });
    if (!otpRecord) {
      throw new RpcException({
        message: 'OTP record not found',
        code: 'OTP_RECORD_NOT_FOUND',
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new RpcException({ message: 'OTP has expired', code: 'OTP_EXPIRED' });
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      throw new RpcException({ message: 'Invalid OTP', code: 'INVALID_OTP' });
    }

    // consume OTP so it cannot be reused
    await this.prisma.otp.delete({ where: { email } });
  }

  /**
   * Find payout stats
   * This is used to find the payout stats including counts by payout type
   * and isCompleted status.
   */
  async getPayoutStats(payload: any): Promise<PayoutStats> {
    try {
      const { startDate, endDate } = payload || {};
      const dateFilter =
        startDate || endDate
          ? {
              createdAt: {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
              },
            }
          : {};

      const [fspCount, vendorCount, failed, success, beneficiaryRedeems] =
        await Promise.all([
          this.prisma.beneficiaryRedeem.count({
            where: {
              transactionType: 'FIAT_TRANSFER',
              status: 'FIAT_TRANSACTION_COMPLETED',
              ...dateFilter,
            },
          }),
          this.prisma.beneficiaryRedeem.count({
            where: {
              transactionType: 'VENDOR_REIMBURSEMENT',
              status: 'COMPLETED',
              ...dateFilter,
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
              ...dateFilter,
            },
          }),
          this.prisma.beneficiaryRedeem.count({
            where: {
              status: {
                in: ['COMPLETED', 'FIAT_TRANSACTION_COMPLETED'],
              },
              ...dateFilter,
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
              ...dateFilter,
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
      throw new RpcException({
        message: 'Failed to fetch payout stats',
        code: 'FAILED_TO_FETCH_PAYOUT_STATS',
      });
    }
  }

  async create(
    payload: CreatePayoutDto,
    prismaService = this.prisma
  ): Promise<Payouts> {
    const { groupId, user, ...createPayoutDto } = payload;
    const projectName = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });
    const projectId = this.configService.get('PROJECT_ID');

    try {
      this.logger.log(
        `Creating new payout for group: ${JSON.stringify(createPayoutDto)}`
      );

      const beneficiaryGroupTokens =
        await prismaService.beneficiaryGroupTokens.findFirst({
          where: { uuid: groupId },
          include: {
            beneficiaryGroup: {
              include: {
                beneficiaries: true,
              },
            },
          },
        });

      if (!beneficiaryGroupTokens) {
        throw new RpcException({
          message: `Beneficiary group tokens with UUID '${groupId}' not found`,
          code: 'PAYOUT_ERR_GROUP_TOKENS_NOT_FOUND',
          params: { groupId },
        });
      }

      this.validateGroupPurposeForPayoutType(
        beneficiaryGroupTokens.beneficiaryGroup.groupPurpose,
        createPayoutDto.type,
        groupId
      );

      const existingPayout = await prismaService.payouts.findFirst({
        where: {
          beneficiaryGroupToken: { uuid: groupId },
          status: { not: 'COMPLETED' },
        },
      });

      if (existingPayout) {
        throw new RpcException({
          message: `Payout with groupId '${groupId}' already exists`,
          code: 'PAYOUT_ERR_GROUP_PAYOUT_EXISTS',
          params: { groupId },
        });
      }

      /*
       * FSP Payout is done by the Offramp service so
       * we need to check and store the payout processor id
       * it be either id for ConnectIPS, Khalti and so on
       */

      //TODO validate bankdetails of the beneficiary
      if (createPayoutDto.type === 'FSP') {
        if (!createPayoutDto.payoutProcessorId) {
          throw new RpcException({
            message: `Payout processor ID is required for FSP payout`,
            code: 'PAYOUT_ERR_PROCESSOR_ID_REQUIRED_FSP',
          });
        }
      } else {
        /*
         * Offline Payout is done by the vendor so
         * we need to check and store the payout processor id which is vendor id
         * If the 'type' is Vendor and mode is OFFLINE
         */
        if (createPayoutDto.mode === 'OFFLINE') {
          if (!createPayoutDto.payoutProcessorId) {
            throw new RpcException({
              message: `Payout processor ID is required for OFFLINE payout`,
              code: 'PAYOUT_ERR_PROCESSOR_ID_REQUIRED_OFFLINE',
            });
          }

          if (!isUUID(createPayoutDto.payoutProcessorId)) {
            throw new RpcException({
              message: `Payout processor ID is not a valid UUID`,
              code: 'PAYOUT_ERR_INVALID_PROCESSOR_ID',
            });
          }

          const vendor = await this.vendorsService.findOne(
            createPayoutDto.payoutProcessorId
          );

          if (!vendor) {
            throw new RpcException({
              message: `Vendor with ID '${createPayoutDto.payoutProcessorId}' not found`,
              code: 'PAYOUT_ERR_VENDOR_NOT_FOUND',
              params: { id: createPayoutDto.payoutProcessorId },
            });
          }
        }
      }

      const payout = await prismaService.payouts.create({
        data: {
          type: createPayoutDto.type,
          mode: createPayoutDto.mode,
          status: createPayoutDto.status,
          extras: createPayoutDto.extras,
          payoutProcessorId: createPayoutDto.payoutProcessorId,
          beneficiaryGroupToken: {
            connect: { uuid: groupId },
          },
        },
      });

      if (payout.type === 'VENDOR') {
        if (createPayoutDto.mode === 'OFFLINE') {
          await this.vendorsService.processVendorOfflinePayout({
            beneficiaryGroupUuid: beneficiaryGroupTokens.groupId,
            amount: String(beneficiaryGroupTokens.numberOfTokens),
          });
        } else {
          await this.vendorsService.processVendorOnlinePayout({
            beneficiaryGroupUuid: beneficiaryGroupTokens.groupId,
            amount: String(beneficiaryGroupTokens.numberOfTokens),
          });
        }
      } else {
        if (createPayoutDto.payoutProcessorId === 'manual-bank-transfer') {
          this.logger.log(
            `Processing manual bank transfer payout for UUID: ${payout.uuid}`
          );

          await this.offrampService.addToManualPayoutQueue({
            payoutUUID: payout.uuid,
          });
        }
      }

      this.logger.log(`Successfully created payout with UUID: ${payout.uuid}`);
      this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
        payload: {
          title: `Payout Created`,
          description: `Payout has been created by ${user?.name} in ${
            projectName.value['project_name'] || projectId
          } for ${beneficiaryGroupTokens.beneficiaryGroup.name}, with ${
            beneficiaryGroupTokens?.beneficiaryGroup.beneficiaries.length
          } beneficiaries with Rs ${
            (beneficiaryGroupTokens?.numberOfTokens * ONE_TOKEN_VALUE) /
            beneficiaryGroupTokens?.beneficiaryGroup.beneficiaries.length
          } each`,
          group: 'Payout',
          projectId: projectId,
          notify: true,
        },
      });
      return payout;
    } catch (error: any) {
      this.logger.error(
        `Failed to create payout: ${error.message}`,
        error.stack
      );
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  /**
   * Validates that a beneficiary group's purpose is compatible with the payout type.
   * GENERAL purpose groups can only receive VENDOR payouts.
   */
  private validateGroupPurposeForPayoutType(
    groupPurpose: GroupPurpose | null,
    payoutType: PayoutType,
    groupId: string
  ): void {
    if (
      groupPurpose === GroupPurpose.GENERAL &&
      payoutType !== PayoutType.VENDOR
    ) {
      this.logger.warn(
        `Group purpose GENERAL not allowed for group: ${groupId} with payout type: ${payoutType}`
      );
      throw new RpcException({
        message: `Group purpose GENERAL is only allowed for VENDOR payouts. Received payout type: ${payoutType}.`,
        code: 'GROUP_PURPOSE_GENERAL_ONLY_FOR_VENDOR_PAYOUTS',
        params: { payoutType },
      });
    }
  }

  async getFSPManualPayoutDetails(payoutUUID: string) {
    const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(
      payoutUUID
    );

    const manualPayoutDetails: FSPManualPayoutDetails[] =
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: payoutUUID,
        payoutProcessorId: 'manual-bank-transfer',
        beneficiaryPhoneNumber: beneficiary.phoneNumber,
      }));

    return manualPayoutDetails;
  }

  async findAll(
    payload: ListPayoutDto
  ): Promise<PaginatedResult<Omit<PayoutWithRelations, 'beneficiaryRedeem'>>> {
    try {
      const { page, perPage, groupName, payoutType, startDate, endDate } =
        payload;

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
        ...(startDate || endDate
          ? {
              createdAt: {
                ...(startDate && { gte: new Date(startDate) }),
                ...(endDate && { lte: new Date(endDate) }),
              },
            }
          : {}),
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
          const { beneficiaryRedeem, ...rest } = eachPayout;

          if (!eachPayout.beneficiaryGroupToken) {
            this.logger.warn(
              `[findAll] payout=${eachPayout.uuid} has no beneficiaryGroupToken, skipping amount calculation`
            );
            return { ...rest, totalSuccessAmount: 0 };
          }

          //  Skip calculation if already completed
          if (eachPayout.status === 'COMPLETED') {
            return {
              ...rest,
              totalSuccessAmount:
                eachPayout.beneficiaryGroupToken.numberOfTokens *
                ONE_TOKEN_VALUE,
            };
          }
          const calculatedStatus = calculatePayoutStatus(eachPayout);
          await this.syncPayoutStatus(eachPayout, calculatedStatus);

          let totalSuccessAmount = 0;
          const beneficiariesCount =
            eachPayout.beneficiaryGroupToken.beneficiaryGroup._count
              .beneficiaries;

          if (calculatedStatus === 'COMPLETED') {
            totalSuccessAmount =
              eachPayout.beneficiaryGroupToken.numberOfTokens * ONE_TOKEN_VALUE;
          } else if (eachPayout.type === 'FSP') {
            const successRequests = eachPayout.beneficiaryRedeem.filter(
              (redeem) => redeem.status === 'FIAT_TRANSACTION_COMPLETED'
            );

            const eachBeneficiaryTokenCount = beneficiariesCount
              ? eachPayout.beneficiaryGroupToken.numberOfTokens /
                beneficiariesCount
              : 0;

            totalSuccessAmount =
              successRequests.length *
              ONE_TOKEN_VALUE *
              eachBeneficiaryTokenCount;
          } else {
            const successRequests = eachPayout.beneficiaryRedeem.filter(
              (redeem) => redeem.status === 'COMPLETED'
            );

            const eachBeneficiaryTokenCount = beneficiariesCount
              ? eachPayout.beneficiaryGroupToken.numberOfTokens /
                beneficiariesCount
              : 0;

            totalSuccessAmount =
              successRequests.length *
              ONE_TOKEN_VALUE *
              eachBeneficiaryTokenCount;
          }

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

  /**
   * Re-evaluates a payout's status right after a beneficiaryRedeem write and
   * persists it (with the completion gap snapshot) if it just became COMPLETED.
   * Call this from processors immediately after updating a redeem's status,
   * instead of relying on a later findOne/findAll read to discover completion.
   *
   * @param payoutUuid - The UUID of the payout to re-check
   */
  async checkAndCompletePayout(payoutUuid: string): Promise<void> {
    const payout = await this.prisma.payouts.findUnique({
      where: { uuid: payoutUuid },
      include: {
        beneficiaryRedeem: { select: { status: true } },
        beneficiaryGroupToken: {
          select: {
            uuid: true,
            status: true,
            numberOfTokens: true,
            isDisbursed: true,
            createdBy: true,
            beneficiaryGroup: {
              select: { _count: { select: { beneficiaries: true } } },
            },
          },
        },
      },
    });

    if (!payout) {
      this.logger.warn(
        `[checkAndCompletePayout] payout not found: ${payoutUuid}`
      );
      return;
    }

    const calculatedStatus = calculatePayoutStatus(
      payout as PayoutWithRelations
    );
    await this.syncPayoutStatus(payout as PayoutWithRelations, calculatedStatus);
  }

  //  Sync payout status in DB if changed, and update object
  async syncPayoutStatus(
    payout: PayoutWithRelations,
    newStatus: RedeemStatus
  ): Promise<void> {
    if (payout.status !== newStatus) {
      const data: { status: RedeemStatus; extras?: any } = {
        status: newStatus,
      };

      // ponytail: snapshot the gap the moment a payout completes, since the
      // activation phase can be reverted+reactivated later and lose its
      // original activatedAt, making later recalculation wrong/negative.
      if (newStatus === 'COMPLETED') {
        const payoutGap = await this.calculatePayoutCompletionGap(
          payout.uuid
        );
        data.extras = { ...(payout.extras as object), payoutGap };

        // group_gap: time from triggerPayout call to payout completion, FSP only.
        if (payout.type === 'FSP') {
          const groupGap = await this.calculateGroupGap(payout);
          if (groupGap) data.extras.group_gap = groupGap;
        }
      }

      await this.prisma.payouts.update({
        where: { uuid: payout.uuid },
        data,
      });
      payout.status = newStatus;
      if (data.extras) payout.extras = data.extras;
    }
  }

  /**
   * Find one payout
   * This is used to find one payout by UUID
   *
   * @param uuid - The UUID of the payout
   * @returns { Payouts & { beneficiaryGroupToken?: { numberOfTokens?: number; beneficiaryGroup?: { beneficiaries?: any[]; name?:string }; }; } } - The payout
   */
  async findOne(uuid: string): Promise<
    Payouts & {
      beneficiaryGroupToken?: {
        numberOfTokens?: number;
        isDisbursed?: boolean;
        info?: any;
        beneficiaryGroup?: {
          beneficiaries?: any[];
          name?: string;
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
        throw new RpcException({
          message: `Payout with UUID '${uuid}' not found`,
          code: 'PAYOUT_ERR_NOT_FOUND',
          params: { uuid },
        });
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
        const storedGap = (payout.extras as { payoutGap?: string })
          ?.payoutGap;

        // backfill for payouts completed before the gap started getting
        // stored on completion
        payoutGap = storedGap ?? (await this.calculatePayoutCompletionGap(uuid));
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
      if (error instanceof RpcException) throw error;
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
      if (error instanceof RpcException) throw error;
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
    const extras = payout.extras as { paymentProviderType?: string } | null;
    if (payout.type === 'VENDOR' || (payout.type === 'FSP' && extras?.paymentProviderType === "manual_bank_transfer")) {
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
        payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length * 2 &&
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
        throw new RpcException({
          message: `Payout with UUID '${uuid}' not found`,
          code: 'PAYOUT_ERR_NOT_FOUND',
          params: { uuid },
        });
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
      if (error instanceof RpcException) throw error;
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
      throw new RpcException({
        message: 'Some beneficiaries have missing wallet addresses',
        code: 'PAYOUT_ERR_MISSING_WALLET_ADDRESSES',
      });
    }

    this.logger.log(
      `Successfully fetched ${BeneficiaryPayoutDetails.length} wallet addresses for payout with UUID: '${uuid}'`
    );
    return BeneficiaryPayoutDetails;
  }

  /**
   * Fetches beneficiaries with incomplete redeems for a specific payout
   * and formats them in the same structure as fetchBeneficiaryPayoutDetails
   */
  private async fetchBeneficiariesWithIncompleteRedeems(
    payoutUUID: string,
    payout: PayoutWithBeneficiaryDetails
  ): Promise<BeneficiaryPayoutDetails[]> {
    this.logger.log(
      `Fetching beneficiaries with incomplete redeems for payout UUID: '${payoutUUID}'`
    );

    // Fetch beneficiaries who have incomplete redeems for this payout
    const beneficiariesWithIncompleteRedeems =
      await this.prisma.beneficiary.findMany({
        where: {
          BeneficiaryRedeem: {
            some: {
              transactionType: 'FIAT_TRANSFER',
              payoutId: payoutUUID,
              isCompleted: false,
            },
          },
        },
        include: {
          BeneficiaryRedeem: {
            where: {
              transactionType: 'FIAT_TRANSFER',
              payoutId: payoutUUID,
              isCompleted: false,
            },
          },
        },
      });

    if (beneficiariesWithIncompleteRedeems.length === 0) {
      this.logger.warn(
        `No beneficiaries with incomplete redeems found for payout UUID: '${payoutUUID}'`
      );
      return [];
    }

    // Calculate token amount per beneficiary
    const totalBeneficiariesInGroup =
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length;
    const numberOfTokensToTransfer =
      totalBeneficiariesInGroup > 0
        ? payout.beneficiaryGroupToken.numberOfTokens /
          totalBeneficiariesInGroup
        : 0;

    // Format beneficiaries to match BeneficiaryPayoutDetails structure
    const formattedBeneficiaries: BeneficiaryPayoutDetails[] =
      beneficiariesWithIncompleteRedeems
        .map((beneficiary) => {
          if (!beneficiary.walletAddress) {
            return null;
          }

          return {
            amount: numberOfTokensToTransfer,
            walletAddress: beneficiary.walletAddress,
            phoneNumber:
              beneficiary.phone ||
              structuredClone<any>(beneficiary.extras)?.phone ||
              '',
            bankDetails: {
              accountName:
                structuredClone<any>(beneficiary.extras)?.bank_ac_name || '',
              accountNumber:
                structuredClone<any>(beneficiary.extras)?.bank_ac_number || '',
              bankName:
                structuredClone<any>(beneficiary.extras)?.bank_name || '',
            },
          };
        })
        .filter(
          (beneficiary): beneficiary is BeneficiaryPayoutDetails =>
            beneficiary !== null
        );

    // Check if any wallet addresses were filtered out
    if (
      formattedBeneficiaries.length !==
      beneficiariesWithIncompleteRedeems.length
    ) {
      this.logger.warn(
        `Some beneficiaries have null or undefined wallet addresses for payout UUID: '${payoutUUID}'. ` +
          `Expected: ${beneficiariesWithIncompleteRedeems.length}, Got: ${formattedBeneficiaries.length}`
      );
    }

    this.logger.log(
      `Successfully fetched and formatted ${formattedBeneficiaries.length} beneficiaries with incomplete redeems ` +
        `for payout UUID: '${payoutUUID}'`
    );

    return formattedBeneficiaries;
  }

  async getPaymentProvider(): Promise<IPaymentProvider[]> {
    return this.offrampService.getPaymentProvider();
  }

  async triggerPayout(uuid: string, user?: any, otp?: string): Promise<any> {
    // Verify OTP before proceeding with payout trigger
    await this.verifyOtp(user?.email, otp);

    //TODO: verify trustline of beneficiary wallet addresses
    const payoutDetails = await this.findOne(uuid);
    const projectId = this.configService.get('PROJECT_ID');
    const projectName = await this.appService.getSettings({
      name: 'PROJECTINFO',
    });
    if (payoutDetails.isPayoutTriggered) {
      throw new RpcException({
        message: `Payout with UUID '${uuid}' has already been triggered`,
        code: 'PAYOUT_ERR_ALREADY_TRIGGERED',
        params: { uuid },
      });
    }

    // Check if tokens have been disbursed to the beneficiary group
    // isDisbursed is set to true only after EVM/Stellar blockchain confirmation
    if (!payoutDetails.beneficiaryGroupToken?.isDisbursed) {
      throw new RpcException({
        message: `Payout cannot be triggered as tokens have not been disbursed to the beneficiary group "${payoutDetails.beneficiaryGroupToken.beneficiaryGroup.name}" yet. Please wait until the fund disbursement is completed and try again later.`,
        code: 'PAYOUT_TRIGGER_TOKENS_NOT_DISBURSED',
        params: { groupName: payoutDetails.beneficiaryGroupToken.beneficiaryGroup.name },
      });
    }

    // Check if this is a manual bank transfer payout - these cannot be triggered
    if (payoutDetails.payoutProcessorId === 'manual-bank-transfer') {
      throw new RpcException({
        message: `Manual bank transfer payouts cannot be triggered. They are processed automatically upon creation.`,
        code: 'MANUAL_BANK_TRANSFER_PAYOUTS_CANNOT_BE_TRIGGERED',
      });
    }

    const payoutExtras = payoutDetails.extras as {
      paymentProviderType: string;
      paymentProviderName: string;
    };

    const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(
      uuid
    );

    // Stash trigger time for group_gap (trigger -> completion), FSP only.
    if (payoutDetails.type === 'FSP') {
      await this.prisma.payouts.update({
        where: { uuid },
        data: {
          extras: {
            ...(payoutDetails.extras as object),
            payoutTriggeredAt: new Date().toISOString(),
          },
        },
      });
    }

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

    await this.stellarTransferService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );
    this.eventEmitter.emit(EVENTS.NOTIFICATION.CREATE, {
      payload: {
        title: `Payout Triggered`,
        description: `Payout ${
          payoutDetails.beneficiaryGroupToken.beneficiaryGroup.name
        } has been triggered by ${user?.name} in ${
          projectName.value['project_name'] || projectId
        }`,
        group: 'Payout',
        projectId: projectId,
        notify: true,
      },
    });
    return 'Payout verification initiated successfully. It may take some time to complete. If a payout verification fails, you can retry it by re-clicking "Verify Manual Payout" button.';
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
        throw new RpcException({
          message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`,
          code: 'PAYOUT_ERR_REDEEM_NOT_FOUND',
          params: { uuid: beneficiaryRedeemUuid },
        });
      }

      if (benfRedeemRequest.isCompleted)
        throw new RpcException({
          message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already completed`,
          code: 'PAYOUT_ERR_REDEEM_ALREADY_COMPLETED',
          params: { uuid: beneficiaryRedeemUuid },
        });

      const transactionType = benfRedeemRequest.transactionType;

      if (transactionType === 'VENDOR_REIMBURSEMENT')
        throw new RpcException({
          message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`,
          code: 'PAYOUT_ERR_REDEEM_NOT_FSP',
          params: { uuid: beneficiaryRedeemUuid },
        });

      if (transactionType === 'TOKEN_TRANSFER') {
        if (benfRedeemRequest.status === 'TOKEN_TRANSACTION_INITIATED') {
          throw new RpcException({
            message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already initiated`,
            code: 'PAYOUT_ERR_REDEEM_ALREADY_INITIATED',
            params: { uuid: beneficiaryRedeemUuid },
          });
        }
        return await this.processOneFailedTokenTransferPayout({
          beneficiaryRedeemUuid,
        });
      }
      if (transactionType === 'FIAT_TRANSFER') {
        if (benfRedeemRequest.status === 'FIAT_TRANSACTION_INITIATED') {
          throw new RpcException({
            message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is already initiated`,
            code: 'PAYOUT_ERR_REDEEM_ALREADY_INITIATED',
            params: { uuid: beneficiaryRedeemUuid },
          });
        }
        return await this.processOneFailedFiatPayout({
          beneficiaryRedeemUuid,
        });
      }

      throw new RpcException({
        message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' is not a FSP Payout request`,
        code: 'PAYOUT_ERR_REDEEM_NOT_FSP',
        params: { uuid: beneficiaryRedeemUuid },
      });
    } catch (error) {
      this.logger.error(
        `Failed to trigger payout for failed request: ${error.message}`,
        error.stack
      );

      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: 'Payout UUID is required for failed payout request',
          code: 'PAYOUT_ERR_FAILED_UUID_REQUIRED',
        });
      }

      const payout = await this.findOne(payoutUUID);
      if (!payout) {
        throw new RpcException({
          message: `Payout with UUID '${payoutUUID}' not found for failed payout request`,
          code: 'PAYOUT_ERR_FAILED_NOT_FOUND',
          params: { uuid: payoutUUID },
        });
      }

      if (!payout.isPayoutTriggered) {
        throw new RpcException({
          message: `Payout with UUID '${payoutUUID}' has not been triggered`,
          code: 'PAYOUT_ERR_NOT_TRIGGERED',
          params: { uuid: payoutUUID },
        });
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

      await this.stellarTransferService.addBulkToTokenTransferQueue(
        failedTokenPayouts
      );

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

      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Payout with UUID '${payoutUUID}' not found`,
          code: 'PAYOUT_ERR_NOT_FOUND',
          params: { uuid: payoutUUID },
        });
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
        const filteredRedeems = await this.getFilteredFspRedeems({
          payoutUUID,
          transactionType,
          transactionStatus,
          search,
        });
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

      throw new RpcException({
        message: `Unsupported payout type: ${payout.type}`,
        code: 'PAYOUT_ERR_UNSUPPORTED_TYPE',
        params: { type: payout.type },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Beneficiary redeem log with UUID '${uuid}' not found`,
          code: 'PAYOUT_ERR_REDEEM_LOG_NOT_FOUND',
          params: { uuid },
        });
      }

      // const info = log.info as Record<string, any> | null;

      // return { ...log, mediaUrl: info?.mediaUrl };

      return log;
    } catch (error) {
      this.logger.error(
        `Failed to get payout log: ${error.message}`,
        error.stack
      );
      if (error instanceof RpcException) throw error;
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

      if (error instanceof RpcException) throw error;
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

    await this.stellarTransferService.addToTokenTransferQueue(
      offrampQueuePayload
    );

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
      throw new RpcException({
        message: `Beneficiary redeem request with UUID '${beneficiaryRedeemUuid}' not found`,
        code: 'PAYOUT_ERR_REDEEM_NOT_FOUND',
        params: { uuid: beneficiaryRedeemUuid },
      });
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
      throw new RpcException({
        message: `Offramp wallet address not found for beneficiary redeem request with UUID '${beneficiaryRedeemUuid}'`,
        code: 'PAYOUT_ERR_REDEEM_OFFRAMP_WALLET_MISSING',
        params: { uuid: beneficiaryRedeemUuid },
      });
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
      throw new RpcException({
        message: 'Project info not found, in SETTINGS',
        code: 'PAYOUT_ERR_PROJECT_INFO_NOT_FOUND',
      });
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

    const activationPhase = data.data.find((p) => p?.disbursementConfig?.disbursementMethods?.includes('TOKEN'));

    if (!activationPhase) {
      this.logger.warn(
        `Activation phase not found for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return 'N/A';
    }

    // ponytail: activatedAt goes null once a phase is reverted; fall back to the
    // last trigger-history snapshot (taken right before the null-out) so a
    // completed payout keeps its gap instead of going negative/N/A.
    let activatedAtRaw = activationPhase.activatedAt;

    this.logger.log(`Activation phase found for riverBasin ${riverBasin} and activeYear ${activeYear}, activatedAt: ${activatedAtRaw}`
    );

    if (!activatedAtRaw) {
      const history = await lastValueFrom(
        this.client.send(
          { cmd: 'ms.jobs.revertPhase.getAll' },
          { phaseUuid: activationPhase.uuid }
        )
      );

      this.logger.log(`Revert history found for phase ${activationPhase.uuid}: ${JSON.stringify(history)}`);

      activatedAtRaw = history?.data?.[0]?.phaseActivationDate;
      this.logger.log(`Fallback to last trigger-history snapshot, activatedAt: ${activatedAtRaw}`)
    }

    if (!activatedAtRaw) {
      this.logger.warn(
        `No activation timestamp (current or historical) found for riverBasin ${riverBasin} and activeYear ${activeYear}`
      );

      return 'N/A';
    }

    const activatedAt = new Date(activatedAtRaw);
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
      new Date(payoutLastLog?.updatedAt).getTime() - activatedAt.getTime();

    console.log(`Payout completion gap in ms: ${diffInMs}`);

    return getFormattedTimeDiff(diffInMs);
  }

  /**
   * Calculate group_gap: time from triggerPayout call to payout completion.
   * FSP payouts only. Uses the `payoutTriggeredAt` timestamp stashed in
   * extras by triggerPayout, and the last beneficiaryRedeem update as the
   * completion time.
   *
   * @param payout - The payout (must have uuid, type, extras)
   * @returns { Promise<string | null> } - formatted gap, or null if trigger time unknown
   */
  async calculateGroupGap(
    payout: Pick<Payouts, 'uuid' | 'type' | 'extras'>
  ): Promise<string | null> {
    const payoutTriggeredAt = (payout.extras as { payoutTriggeredAt?: string })
      ?.payoutTriggeredAt;

    if (!payoutTriggeredAt) {
      this.logger.warn(
        `[calculateGroupGap] payoutTriggeredAt not found for payout ${payout.uuid}, skipping group_gap`
      );
      return null;
    }

    const payoutLastLog = await this.prisma.beneficiaryRedeem.findFirst({
      where: { payout: { uuid: payout.uuid } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!payoutLastLog) {
      this.logger.warn(
        `[calculateGroupGap] payout last log not found for payout with UUID ${payout.uuid}`
      );
      return null;
    }

    const diffInMs =
      new Date(payoutLastLog.updatedAt).getTime() -
      new Date(payoutTriggeredAt).getTime();

    return getFormattedTimeDiff(diffInMs);
  }

  /**
   * Verifies manual payout by matching bank account data with beneficiaries
   * and initiating token transfers for matched records
   * @param payoutUUID - The UUID of the payout to verify
   * @param data - Manual payout data containing bank account information
   * @returns Verification result with matched and unmatched records
   */
  async verifyManualPayout(
    payoutUUID: string,
    data?: Record<string, ManualPayoutRowData>,
    matchBy: ManualPayoutMatchBy = 'bankAccount'
  ): Promise<ManualPayoutVerificationResult> {
    this.validatePayoutUUID(payoutUUID);

    this.logger.log(
      `Starting manual payout verification for payout UUID: '${payoutUUID}' (matchBy: ${matchBy})`
    );

    const payout = await this.fetchPayoutWithBeneficiaries(payoutUUID);
    const payoutRows = this.parseManualPayoutData(data, matchBy);
    const beneficiaries = await this.fetchBeneficiariesWithIncompleteRedeems(
      payoutUUID,
      payout
    );

    this.logger.log(
      `Fetched ${beneficiaries.length} beneficiaries with incomplete redeems for payout UUID: '${payoutUUID}'`
    );
    ``;

    const verificationResult = this.matchBeneficiariesWithPayoutRows(
      payoutRows,
      beneficiaries,
      payoutUUID,
      matchBy
    );

    this.logVerificationStats(verificationResult, payoutRows.length, matchBy);
    this.validateMatchedBeneficiaries(verificationResult, matchBy);

    const fieldOfficerAddress = await this.getFieldOfficerWalletAddress();
    const tokenAmount = this.calculateTokenAmountPerBeneficiary(payout);

    await this.processTokenTransfers(
      verificationResult.matched,
      fieldOfficerAddress,
      tokenAmount
    );

    this.logger.log(
      `Manual payout verification completed successfully for UUID: '${payoutUUID}'. ` +
        `Processed ${verificationResult.matched.length} matched records.`
    );

    return verificationResult;
  }

  /**
   * Validates the payout UUID parameter
   */
  private validatePayoutUUID(payoutUUID: string): void {
    if (!payoutUUID) {
      throw new RpcException({
        message:
          'Payout verification failed: Payout UUID is required but was not provided',
        code: 'PAYOUT_VERIFY_UUID_REQUIRED',
      });
    }

    if (!isUUID(payoutUUID)) {
      throw new RpcException({
        message: `Payout verification failed: Invalid UUID format provided: '${payoutUUID}'`,
        code: 'PAYOUT_VERIFY_INVALID_UUID_FORMAT',
        params: { payoutUUID },
      });
    }
  }

  /**
   * Fetches payout with beneficiary details
   */
  private async fetchPayoutWithBeneficiaries(
    payoutUUID: string
  ): Promise<PayoutWithBeneficiaryDetails> {
    const payout = await this.prisma.payouts.findUnique({
      where: { uuid: payoutUUID },
      include: {
        beneficiaryGroupToken: {
          include: {
            beneficiaryGroup: {
              include: {
                beneficiaries: true,
              },
            },
          },
        },
      },
    });

    // Ensure tokens have been disbursed to the beneficiary group
    if (
      payout?.beneficiaryGroupToken &&
      !payout.beneficiaryGroupToken.isDisbursed
    ) {
      throw new RpcException({
        message: `Payout cannot be verified as tokens have not been disbursed to the beneficiary group "${payout.beneficiaryGroupToken.beneficiaryGroup.name}" yet. Please wait until the fund disbursement is completed and try again later.`,
        code: 'PAYOUT_VERIFY_TOKENS_NOT_DISBURSED',
        params: { groupName: payout.beneficiaryGroupToken.beneficiaryGroup.name },
      });
    }

    if (!payout) {
      throw new RpcException({
        message: `Payout verification failed: Payout with UUID '${payoutUUID}' not found in database`,
        code: 'PAYOUT_VERIFY_PAYOUT_NOT_FOUND',
        params: { payoutUUID },
      });
    }

    if (!payout.beneficiaryGroupToken?.beneficiaryGroup?.beneficiaries) {
      throw new RpcException({
        message: `Payout verification failed: No beneficiaries found for payout '${payoutUUID}'`,
        code: 'PAYOUT_VERIFY_NO_BENEFICIARIES_FOUND',
        params: { payoutUUID },
      });
    }

    return payout as PayoutWithBeneficiaryDetails;
  }

  /**
   * Parses and validates manual payout data
   */
  private parseManualPayoutData(
    data?: Record<string, ManualPayoutRowData>,
    matchBy: ManualPayoutMatchBy = 'bankAccount'
  ): ManualPayoutRowData[] {
    if (!data || typeof data !== 'object') {
      throw new RpcException({
        message: 'Payout verification failed: Invalid or missing payout data provided',
        code: 'PAYOUT_VERIFY_INVALID_DATA',
      });
    }

    let rows = Object.values(data);

    if (rows.length === 0) {
      throw new RpcException({
        message: 'Payout verification failed: No payout records found in provided data',
        code: 'PAYOUT_VERIFY_NO_RECORDS_FOUND',
      });
    }

    // Validate required fields in each row
    rows.forEach((row, index) => {
      if (!row['Transaction Status']) {
        throw new RpcException({
          message: `Payout verification failed: Missing transaction status in row ${
            index + 1
          }`,
          code: 'PAYOUT_VERIFY_MISSING_TRANSACTION_STATUS',
          params: { row: index + 1 },
        });
      }
      if (matchBy === 'phoneNumber') {
        if (!row['Phone Number']) {
          throw new RpcException({
            message: `Payout verification failed: Missing phone number in row ${
              index + 1
            }`,
            code: 'PAYOUT_VERIFY_MISSING_PHONE_NUMBER',
            params: { row: index + 1 },
          });
        }
      } else {
        if (!row['Bank Account Number']) {
          throw new RpcException({
            message: `Payout verification failed: Missing bank account number in row ${
              index + 1
            }`,
            code: 'PAYOUT_VERIFY_MISSING_BANK_ACCOUNT_NUMBER',
            params: { row: index + 1 },
          });
        }
        if (!row['Bank Account Holder Name ']) {
          throw new RpcException({
            message: `Payout verification failed: Missing bank account holder name in row ${
              index + 1
            }`,
            code: 'PAYOUT_VERIFY_MISSING_BANK_ACCOUNT_HOLDER_NAME',
            params: { row: index + 1 },
          });
        }
      }
    });

    this.logger.log(`Parsed ${rows.length} payout records from provided data`);

    rows = rows.filter(
      (row) => row['Transaction Status'].toLowerCase() === 'completed'
    );

    this.logger.log(
      `Filtered ${rows.length} payout records from provided data`
    );

    return rows;
  }

  /**
   * Matches beneficiaries with payout rows based on bank account numbers
   */
  private matchBeneficiariesWithPayoutRows(
    payoutRows: ManualPayoutRowData[],
    beneficiaries: BeneficiaryPayoutDetails[],
    payoutUUID: string,
    matchBy: ManualPayoutMatchBy = 'bankAccount'
  ): ManualPayoutVerificationResult {
    const enrichedRows: EnrichedManualPayoutRow[] = payoutRows.map((row) => {
      const matchedBeneficiary = beneficiaries.find((beneficiary) =>
        matchBy === 'phoneNumber'
          ? beneficiary.phoneNumber === String(row['Phone Number']).trim()
          : beneficiary.bankDetails.accountNumber ===
            String(row['Bank Account Number']).trim()
      );

      return {
        ...row,
        beneficiary: matchedBeneficiary || null,
        payoutId: payoutUUID,
      };
    });

    const result = enrichedRows.reduce<ManualPayoutVerificationResult>(
      (acc, row) => {
        if (row.beneficiary) {
          acc.matched.push(row);
        } else {
          acc.unmatched.push(row);
        }
        return acc;
      },
      { matched: [], unmatched: [] }
    );

    return result;
  }

  /**
   * Logs verification statistics
   */
  private logVerificationStats(
    result: ManualPayoutVerificationResult,
    totalRows: number,
    matchBy: ManualPayoutMatchBy = 'bankAccount'
  ): void {
    const matchPercentage = ((result.matched.length / totalRows) * 100).toFixed(
      1
    );

    this.logger.log(
      `Payout verification statistics: ` +
        `Total records: ${totalRows}, ` +
        `Matched: ${result.matched.length} (${matchPercentage}%), ` +
        `Unmatched: ${result.unmatched.length}`
    );

    if (result.unmatched.length > 0) {
      this.logger.warn(
        `Found ${result.unmatched.length} unmatched records. ` +
          `These beneficiaries may not be registered or have incorrect ${
            matchBy === 'phoneNumber' ? 'phone number' : 'bank account'
          } information.`
      );
    }
  }

  /**
   * Validates that we have matched beneficiaries to process
   */
  private validateMatchedBeneficiaries(
    result: ManualPayoutVerificationResult,
    matchBy: ManualPayoutMatchBy = 'bankAccount'
  ): void {
    if (result.matched.length === 0) {
      if (matchBy === 'phoneNumber') {
        throw new RpcException({
          message:
            'Payout verification failed: No beneficiary phone numbers matched with the provided data. ' +
            'Please verify that the phone numbers in your file match the registered beneficiaries.',
          code: 'PAYOUT_VERIFY_NO_PHONE_MATCHES',
        });
      }
      throw new RpcException({
        message:
          'Payout verification failed: No beneficiary bank accounts matched with the provided data. ' +
          'Please verify that the bank account numbers in your file match the registered beneficiaries.',
        code: 'PAYOUT_VERIFY_NO_BANK_ACCOUNT_MATCHES',
      });
    }
  }

  /**
   * Retrieves field officer wallet address from settings
   */
  private async getFieldOfficerWalletAddress(): Promise<string> {
    const fundManagementConfig = await this.getFromSettings(
      'FUNDMANAGEMENT_TAB_CONFIG'
    );

    const isProjectCashTracker = !fundManagementConfig.tabs?.some(
      (tab: any) => tab.value === 'cashTracker'
    );

    const deployerPrivateKey = await this.settingService.getPublic(
      'DEPLOYER_PRIVATE_KEY'
    );

    if (!isProjectCashTracker) {
      if (!deployerPrivateKey.value) {
        throw new RpcException({
          message: 'Payout verification failed: Deployer private key not configured in system settings',
          code: 'PAYOUT_VERIFY_DEPLOYER_KEY_NOT_CONFIGURED',
        });
      }

      const deployerWalletAddress = new ethers.Wallet(
        deployerPrivateKey.value as string
      ).address;

      return deployerWalletAddress;
    }

    const entitiesSettings = await this.settingService.getPublic('ENTITIES');

    if (!entitiesSettings?.value) {
      throw new RpcException({
        message: 'Payout verification failed: Entity configuration not found in system settings',
        code: 'PAYOUT_VERIFY_ENTITY_CONFIG_NOT_FOUND',
      });
    }

    const entities = entitiesSettings.value as unknown as EntityConfig[];

    if (!Array.isArray(entities)) {
      throw new RpcException({
        message: 'Payout verification failed: Invalid entity configuration format in system settings',
        code: 'PAYOUT_VERIFY_INVALID_ENTITY_CONFIG_FORMAT',
      });
    }

    const fieldOfficer = entities.find((entity) => entity.isFieldOffice);

    if (!fieldOfficer?.address) {
      throw new RpcException({
        message: 'Payout verification failed: Field officer wallet address not configured in system settings',
        code: 'PAYOUT_VERIFY_FIELD_OFFICER_ADDRESS_NOT_CONFIGURED',
      });
    }

    this.logger.log(
      `Using field officer wallet address (Smart contract account): ${fieldOfficer.smartAccount}`
    );
    return fieldOfficer.smartAccount;
  }

  /**
   * Calculates token amount per beneficiary
   */
  private calculateTokenAmountPerBeneficiary(
    payout: PayoutWithBeneficiaryDetails
  ): string {
    const totalTokens = payout.beneficiaryGroupToken.numberOfTokens;
    const beneficiaryCount =
      payout.beneficiaryGroupToken.beneficiaryGroup.beneficiaries.length;

    if (beneficiaryCount === 0) {
      throw new RpcException({
        message: 'Payout verification failed: Cannot calculate token amount - no beneficiaries found',
        code: 'PAYOUT_VERIFY_CANNOT_CALCULATE_TOKEN_AMOUNT',
      });
    }

    const tokenAmountPerBeneficiary = totalTokens / beneficiaryCount;
    this.logger.log(
      `Calculated token amount per beneficiary: ${tokenAmountPerBeneficiary} ` +
        `(${totalTokens} total tokens / ${beneficiaryCount} beneficiaries)`
    );

    return tokenAmountPerBeneficiary.toString();
  }

  /**
   * Processes token transfers for matched beneficiaries
   */
  private async processTokenTransfers(
    matchedRows: EnrichedManualPayoutRow[],
    fieldOfficerAddress: string,
    tokenAmount: string
  ): Promise<void> {
    const transfers = matchedRows.map((row) => ({
      beneficiaryWalletAddress: row.beneficiary!.walletAddress,
      vendorWalletAddress: fieldOfficerAddress,
      amount: tokenAmount,
      date: row['Date'],
      approvalDate: row['Approval Date'],
    }));

    const batchTransferPayload: ManualPayoutBatchTransferDto = {
      transfers,
    };

    const job = await this.batchTransferQueue.add(
      JOBS.BATCH_TRANSFER.PROCESS_MANUAL_PAYOUT_BATCH,
      batchTransferPayload,
      {
        attempts: 3,
        delay: 1000,
        removeOnComplete: true,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    this.logger.log(
      `Successfully queued batch transfer job with ID: ${job.id} ` +
        `for ${transfers.length} token transfers`
    );
  }

  /**
   * Adds matched records to offramp verification queue
   */
  private async addToOfframpVerificationQueue(
    matchedRows: EnrichedManualPayoutRow[]
  ): Promise<void> {
    try {
      await this.offrampService.addToVerifyManualPayoutQueue(matchedRows);
      this.logger.log(
        `Successfully added ${matchedRows.length} records to offramp verification queue`
      );
    } catch (error) {
      this.logger.error(
        `Failed to add records to offramp verification queue: ${error.message}`,
        error.stack
      );
      throw new RpcException({
        message:
          'Payout verification completed but failed to queue offramp verification. ' +
          'Manual intervention may be required.',
        code: 'PAYOUT_VERIFY_FAILED_TO_QUEUE_OFFRAMP',
      });
    }
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
              beneficiaryGroup: {
                select: {
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

      if (!log) {
        throw new RpcException({
          message: `Beneficiary redeem log with UUID '${uuid}' not found`,
          code: 'PAYOUT_ERR_REDEEM_LOG_NOT_FOUND',
          params: { uuid },
        });
      }

      // 👇 if payout type is FSP, use your filtering function
      let redeemLogs = log.beneficiaryRedeem;
      if (log.type === 'FSP') {
        redeemLogs = await this.getFilteredFspRedeems({
          payoutUUID: uuid,
        });
      }

      const result = redeemLogs.map((redeemLog) => {
        const extras = parseJsonField(redeemLog.Beneficiary?.extras);
        const info = parseJsonField(redeemLog.info);

        const payoutType = redeemLog.payout?.type;

        const base = {
          'Beneficiary Wallet Address': redeemLog.beneficiaryWalletAddress,
          'Phone number': extras?.phone || '',
          'Transaction Wallet ID': redeemLog.txHash || '',
          'Transaction Hash': info?.transactionHash || '',
          'Payout Status': redeemLog.status || '',
          'Transaction Type': redeemLog.transactionType || '',
          'Updated At': redeemLog.updatedAt,
          'Actual Budget': (() => {
            const totalTokens = log?.beneficiaryGroupToken?.numberOfTokens || 0;
            const beneficiaryCount =
              log?.beneficiaryGroupToken?.beneficiaryGroup?._count
                ?.beneficiaries || 1;
            return (totalTokens / beneficiaryCount) * ONE_TOKEN_VALUE;
          })(),
          'Amount Disbursed': [
            'COMPLETED',
            'FIAT_TRANSACTION_COMPLETED',
            'TOKEN_TRANSACTION_COMPLETED',
          ].includes(redeemLog?.status)
            ? (redeemLog.amount || 0) * ONE_TOKEN_VALUE
            : 0,
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
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  private async getFilteredFspRedeems(params: {
    payoutUUID: string;
    transactionType?: PayoutTransactionType;
    transactionStatus?: PayoutTransactionStatus;
    search?: string;
  }) {
    const { payoutUUID, transactionType, transactionStatus, search } = params;

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
            { txHash: { contains: search, mode: 'insensitive' } },
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
    }, {} as Record<string, any>);

    // Apply filtering logic
    const filteredRedeems = [];
    for (const walletAddress in redeemsByWallet) {
      const walletRedeems = redeemsByWallet[walletAddress];
      if (walletRedeems.FIAT_TRANSFER) {
        filteredRedeems.push(walletRedeems.FIAT_TRANSFER);
      } else if (walletRedeems.TOKEN_TRANSFER) {
        if (
          walletRedeems.TOKEN_TRANSFER.status !== 'TOKEN_TRANSACTION_COMPLETED'
        ) {
          filteredRedeems.push(walletRedeems.TOKEN_TRANSFER);
        }
      }
    }

    return filteredRedeems;
  }

  private async getFromSettings(key: string): Promise<any> {
    try {
      const settings = await this.prisma.setting.findUnique({
        where: {
          name: key,
        },
      });

      if (!settings?.value) {
        throw new RpcException({
          message: `${key} not found`,
          code: 'SETTING_KEY_NOT_FOUND',
          params: { key },
        });
      }

      return settings.value;
    } catch (error) {
      if (error instanceof RpcException) throw error;
      this.logger.error(`Error getting setting ${key}: ${error.message}`);
      throw error;
    }
  }
}
