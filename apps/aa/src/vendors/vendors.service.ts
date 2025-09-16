import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { CORE_MODULE } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginationBaseDto } from './common';
import { VendorRedeemDto, VendorStatsDto } from './dto/vendorStats.dto';
import { lastValueFrom } from 'rxjs';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { VendorRedeemTxnListDto } from './dto/vendorRedemTxn.dto';
import { VendorBeneficiariesDto } from './dto/vendorBeneficiaries.dto';
import {
  GetVendorOfflineBeneficiariesDto,
  OfflineBeneficiaryDetail,
  VerifyVendorOfflineOtpDto,
  OtpVerificationResult,
  VendorOfflineSyncDto,
} from './dto/vendor-offline-beneficiaries.dto';
import {
  VendorOfflinePayoutDto,
  TestVendorOfflinePayoutDto,
  VendorOnlinePayoutDto,
} from './dto/vendor-offline-payout.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BQUEUE, JOBS } from '../constants';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    private readonly receiveService: ReceiveService,
    @InjectQueue(BQUEUE.VENDOR_CVA)
    private readonly vendorCVAPayoutQueue: Queue
  ) {}

  async listWithProjectData(query: PaginationBaseDto) {
    const { page, perPage, sort, order, search } = query;

    const orderBy: Record<string, 'asc' | 'desc'> = {};
    orderBy[sort] = order;

    return paginate(
      this.prisma.vendor,
      {
        where: {
          name: { contains: search, mode: 'insensitive' },
        },
        orderBy,
      },
      {
        page,
        perPage,
      }
    );
  }

  async findOne(uuid: string) {
    return this.prisma.vendor.findUnique({
      where: { uuid },
    });
  }

  async getVendorWalletStats(vendorWallet: VendorStatsDto) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: vendorWallet.uuid },
        select: {
          uuid: true,
          walletAddress: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!vendor) {
        throw new RpcException(`Vendor with id ${vendorWallet.uuid} not found`);
      }

      const vendorBalance = await this.receiveService.getAccountBalance(
        vendor.walletAddress
      );

      if (!vendorBalance) {
        throw new RpcException(
          `Failed to get balance for vendor with id ${vendorWallet.uuid}`
        );
      }

      return {
        assignedTokens: await this.getVendorAssignedTokens(
          vendorWallet.uuid,
          false
        ),
        disbursedTokens: await this.getVendorAssignedTokens(
          vendorWallet.uuid,
          true
        ),
        vendorAssignedBalance: await this.getVendorAssignedBalance(
          vendorWallet.uuid
        ),
        balances: vendorBalance,
        transactions: await this.getRecentTransactionDb(vendorWallet),
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getVendorAssignedTokens(
    vendorUuid: string,
    disbursed: boolean = false
  ) {
    try {
      this.logger.log(`Getting assigned tokens for vendor ${vendorUuid}`);

      const payouts = await this.prisma.payouts.findMany({
        where: {
          type: 'VENDOR',
          payoutProcessorId: vendorUuid,
          ...(disbursed && {
            beneficiaryGroupToken: {
              isDisbursed: true,
            },
          }),
        },
        include: {
          beneficiaryGroupToken: true,
        },
      });

      const totalAssignedTokens = payouts.reduce((acc, payout) => {
        return acc + Number(payout.beneficiaryGroupToken.numberOfTokens);
      }, 0);

      return totalAssignedTokens;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getVendorAssignedBalance(vendorUuid: string) {
    try {
      this.logger.log(`Getting assigned balance for vendor ${vendorUuid}`);

      const result = await this.prisma.beneficiaryRedeem.aggregate({
        where: {
          vendorUid: vendorUuid,
          status: 'COMPLETED',
        },
        _sum: {
          amount: true,
        },
      });

      return result._sum.amount || 0;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getRedemptionRequest(vendorWallet: VendorRedeemDto) {
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

  async getTxnAndRedemptionList(payload: VendorRedeemTxnListDto) {
    try {
      const { page, perPage, uuid, txHash, status } = payload;
      const query = {
        where: {
          vendorUid: uuid,
          status: 'COMPLETED',
          ...(txHash && { txHash }),
        },
        include: {
          Beneficiary: {
            select: {
              uuid: true,
              extras: true,
              walletAddress: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      };

      // Get paginated transactions
      const result = await paginate(this.prisma.beneficiaryRedeem, query, {
        page,
        perPage,
      });

      // Get beneficiary UUIDs for name lookup
      const beneficiaryUuids = result.data
        .map((redeem: any) => redeem.Beneficiary?.uuid)
        .filter(Boolean);

      this.logger.log(
        `Found ${
          beneficiaryUuids.length
        } beneficiary UUIDs for name lookup: ${JSON.stringify(
          beneficiaryUuids
        )}`
      );

      let benResponse = [];
      if (beneficiaryUuids.length) {
        benResponse = await lastValueFrom(
          this.client.send(
            { cmd: 'rahat.jobs.beneficiary.find_phone_by_uuid' },
            beneficiaryUuids
          )
        );
        this.logger.log(
          `Received beneficiary response: ${JSON.stringify(benResponse)}`
        );
      }

      // Transform the data to include phone number from extras and name from benResponse
      const transformedData = result.data.map((redeem: any) => {
        const benInfo = benResponse.find(
          (b: any) => b.uuid === redeem.Beneficiary?.uuid
        );
        this.logger.log(
          `Looking for beneficiary ${
            redeem.Beneficiary?.uuid
          }, found: ${JSON.stringify(benInfo)}`
        );
        return {
          ...redeem,
          Beneficiary: {
            ...redeem.Beneficiary,
            phone: (redeem.Beneficiary?.extras as any)?.phone || null,
            name: benInfo?.name || null,
          },
        };
      });

      return {
        ...result,
        data: transformedData,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  private async getRecentTransactionDb(walletBalanceDto: VendorStatsDto) {
    try {
      const transactions = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: walletBalanceDto.uuid,
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: walletBalanceDto.take || 10,
        skip: walletBalanceDto.skip || 0,
      });

      if (!transactions) {
        throw new RpcException(
          `Transactions not found for vendor with id ${walletBalanceDto.uuid}`
        );
      }

      const beneficiaryWalletAddresses = transactions.map(
        (txn) => txn.beneficiaryWalletAddress
      );

      const benResponse = await lastValueFrom(
        this.client.send(
          { cmd: 'rahat.jobs.beneficiary.get_bulk_by_wallet' },
          beneficiaryWalletAddresses
        )
      );

      if (!benResponse) {
        throw new RpcException(`Failed to get beneficiaries info`);
      }

      return transactions.map((txn) => {
        return {
          title: txn.transactionType,
          subtitle: txn.beneficiaryWalletAddress,
          date: txn.createdAt,
          amount: Number(txn.amount).toFixed(0),
          hash: txn.txHash,
          beneficiaryName: benResponse.find(
            (ben) => ben.walletAddress === txn.beneficiaryWalletAddress
          )?.piiData?.name,
        };
      });
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async getVendorBeneficiaries(payload: VendorBeneficiariesDto) {
    try {
      this.logger.log(
        `Getting beneficiaries for vendor ${payload.vendorUuid} with payout mode ${payload.payoutMode}`
      );

      // First verify the vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(
          `Vendor with id ${payload.vendorUuid} not found`
        );
      }

      // Build where clause for beneficiary redeem query
      const redeemWhereClause: any = {
        transactionType: 'VENDOR_REIMBURSEMENT',
        vendorUid: payload.vendorUuid,
      };

      // Add wallet address filter if provided
      if (payload.walletAddress) {
        redeemWhereClause.beneficiaryWalletAddress = payload.walletAddress;
      }

      // Case Online: Get all beneficiary redeem of that vendor with status completed
      // Case Offline: Get all beneficiaryRedeem of that vendor (don't care for status)
      if (payload.payoutMode === 'ONLINE') {
        redeemWhereClause.status = 'COMPLETED';
      }

      const beneficiaryRedeems = await this.prisma.beneficiaryRedeem.findMany({
        where: redeemWhereClause,
        include: {
          Beneficiary: {
            select: {
              uuid: true,
              walletAddress: true,
              phone: true,
              gender: true,
              benTokens: true,
              isVerified: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: payload.perPage || 20,
        skip: ((payload.page || 1) - 1) * (payload.perPage || 20),
      });

      if (!beneficiaryRedeems.length) {
        return paginate(
          { findMany: async () => [], count: async () => 0 },
          {},
          { page: payload.page, perPage: payload.perPage }
        );
      }

      // Extract unique beneficiaries (remove duplicates based on UUID)
      const uniqueBeneficiaries = beneficiaryRedeems
        .map((redeem) => ({
          uuid: redeem.Beneficiary.uuid,
          walletAddress: redeem.Beneficiary.walletAddress,
          phone: redeem.Beneficiary.phone,
          gender: redeem.Beneficiary.gender,
          isVerified: redeem.Beneficiary.isVerified,
          createdAt: redeem.Beneficiary.createdAt,
          // Use the individual redeem amount instead of total benTokens
          benTokens: redeem.amount,
          txHash: redeem.txHash,
          status: redeem.status,
          info: redeem.info,
        }))
        .filter(
          (beneficiary, index, self) =>
            index === self.findIndex((b) => b.uuid === beneficiary.uuid)
        );

      // Get beneficiary UUIDs for enrichment
      const beneficiaryUuids = uniqueBeneficiaries.map((ben) => ben.uuid);
      let benResponse = [];
      if (beneficiaryUuids.length) {
        benResponse = await lastValueFrom(
          this.client.send(
            { cmd: 'rahat.jobs.beneficiary.find_phone_by_uuid' },
            beneficiaryUuids
          )
        );
      }

      // Filter based on mode
      const filteredBeneficiaries = uniqueBeneficiaries.filter((ben) => {
        const info = ben.info;
        const hasOfflineMode =
          info &&
          typeof info === 'object' &&
          !Array.isArray(info) &&
          'mode' in info &&
          info.mode === 'OFFLINE';

        if (payload.payoutMode === 'ONLINE') {
          // Remove beneficiaries which have mode: offline in info
          return !hasOfflineMode;
        } else {
          // Only return beneficiaries which have mode: offline in info
          return hasOfflineMode;
        }
      });

      // Attach beneficiary name to each beneficiary
      const enrichedBeneficiaries = filteredBeneficiaries.map((ben) => {
        const benInfo = benResponse.find((b) => b.uuid === ben.uuid);
        return {
          ...ben,
          name: benInfo?.name || null,
        };
      });

      // Use the reusable paginator
      return paginate(
        {
          findMany: async () => enrichedBeneficiaries,
          count: async () => enrichedBeneficiaries.length,
        },
        {},
        { page: payload.page, perPage: payload.perPage }
      );
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async processVendorOnlinePayout(payload: VendorOnlinePayoutDto) {
    try {
      this.logger.log(
        `Processing online payout for beneficiary group ${payload.beneficiaryGroupUuid}`
      );
      // Add job to queue for processing
      await this.vendorCVAPayoutQueue.add(JOBS.VENDOR.ONLINE_PAYOUT, {
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
        amount: payload.amount,
      });

      this.logger.log(
        `Job added to queue for beneficiary group ${payload.beneficiaryGroupUuid} online payout`
      );

      return {
        success: true,
        message: 'Vendor online payout job added to queue',
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }


  async processVendorOfflinePayout(payload: VendorOfflinePayoutDto) {
    try {
      this.logger.log(
        `Processing offline payout for beneficiary group ${payload.beneficiaryGroupUuid}`
      );
      // Add job to queue for processing
      await this.vendorCVAPayoutQueue.add(JOBS.VENDOR.OFFLINE_PAYOUT, {
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
        amount: payload.amount,
      });

      this.logger.log(
        `Job added to queue for beneficiary group ${payload.beneficiaryGroupUuid} offline payout`
      );

      return {
        success: true,
        message: 'Vendor offline payout job added to queue',
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  // todo: remove after test
  async testVendorOfflinePayout(payload: TestVendorOfflinePayoutDto) {
    try {
      this.logger.log(
        `Testing offline payout for beneficiary group ${payload.beneficiaryGroupUuid}`
      );

      // Add job to queue for processing
      const jobData = {
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
        ...(payload.testAmount && { amount: payload.testAmount }),
      };

      await this.vendorCVAPayoutQueue.add(
        JOBS.VENDOR.OFFLINE_PAYOUT,
        jobData
      );

      this.logger.log(
        `Test job added to queue for beneficiary group ${payload.beneficiaryGroupUuid} offline payout`
      );

      return {
        success: true,
        message: 'Vendor offline payout test job added to queue',
        beneficiaryGroupUuid: payload.beneficiaryGroupUuid,
        testAmount: payload.testAmount,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async verifyVendorOfflineOtp(
    payload: VerifyVendorOfflineOtpDto
  ): Promise<OtpVerificationResult> {
    try {
      this.logger.log(
        `Verifying OTP for phone ${payload.phoneNumber} and vendor ${payload.vendorUuid}`
      );

      // First verify the vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });

      if (!vendor) {
        throw new RpcException(
          `Vendor with id ${payload.vendorUuid} not found`
        );
      }

      // Get OTP data for the phone number
      const otpData = await this.prisma.otp.findUnique({
        where: { phoneNumber: payload.phoneNumber },
      });

      if (!otpData) {
        return {
          isValid: false,
          message: 'No OTP found for this phone number',
        };
      }

      // Check if OTP has expired
      if (new Date() > otpData.expiresAt) {
        return {
          isValid: false,
          message: 'OTP has expired',
        };
      }

      // Check if OTP is already verified
      if (otpData.isVerified) {
        return {
          isValid: false,
          message: 'OTP has already been used',
        };
      }

      // Verify the OTP using bcrypt
      const isValidOtp = await bcrypt.compare(
        `${payload.otp}:${otpData.amount}`,
        otpData.otpHash
      );

      if (!isValidOtp) {
        return {
          isValid: false,
          message: 'Invalid OTP',
        };
      }

      // Get beneficiary information
      const beneficiary = await this.prisma.beneficiary.findFirst({
        where: { phone: payload.phoneNumber },
      });

      if (!beneficiary) {
        return {
          isValid: false,
          message: 'Beneficiary not found for this phone number',
        };
      }

      // Mark OTP as verified
      await this.prisma.otp.update({
        where: { phoneNumber: payload.phoneNumber },
        data: { isVerified: true },
      });

      this.logger.log(
        `OTP verified successfully for phone ${payload.phoneNumber}`
      );

      return {
        isValid: true,
        message: 'OTP verified successfully',
        beneficiaryUuid: beneficiary.uuid,
        amount: otpData.amount,
        walletAddress: beneficiary.walletAddress,
      };
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async fetchVendorOfflineBeneficiaries(
    payload: GetVendorOfflineBeneficiariesDto
  ): Promise<OfflineBeneficiaryDetail[]> {
    try {
      this.logger.log(
        `Getting offline beneficiaries for vendor ${payload.vendorUuid}`
      );

      // First verify the vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });
      if (!vendor) {
        throw new RpcException(
          `Vendor with id ${payload.vendorUuid} not found`
        );
      }

      // Find all beneficiaryRedeem records for this vendor
      const redeems = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: payload.vendorUuid,
          transactionType: 'VENDOR_REIMBURSEMENT',
        },
        include: {
          Beneficiary: true,
        },
      });

      if (!redeems.length) {
        this.logger.log(
          `No beneficiary payout records found for vendor ${payload.vendorUuid}`
        );
        return [];
      }

      // Get beneficiary wallet addresses for API call
      const beneficiaryWalletAddresses = redeems
        .map((redeem) => redeem.Beneficiary?.walletAddress)
        .filter(Boolean);

      // Get beneficiary details from API
      let benResponse = [];
      if (beneficiaryWalletAddresses.length) {
        benResponse = await lastValueFrom(
          this.client.send(
            { cmd: 'rahat.jobs.beneficiary.get_bulk_by_wallet' },
            beneficiaryWalletAddresses
          )
        );
      }

      // For each redeem, get the OTP hash from the OTP table
      const beneficiaries: OfflineBeneficiaryDetail[] = [];
      for (const redeem of redeems) {
        const beneficiary = redeem.Beneficiary;
        if (!beneficiary) continue;

        // Find beneficiary info from API response
        const benInfo = benResponse.find(
          (b) => b.walletAddress === beneficiary.walletAddress
        );
        const phoneNumber = benInfo?.piiData?.phone || '';
        const beneficiaryName = benInfo?.piiData?.name || 'Unknown';

        // Get OTP for this beneficiary
        const otpData = await this.prisma.otp.findUnique({
          where: { phoneNumber },
        });

        beneficiaries.push({
          uuid: redeem.uuid,
          beneficiaryUuid: beneficiary.uuid,
          beneficiaryName,
          phoneNumber,
          otpHash: otpData?.otpHash || '',
          amount: redeem.amount,
          status: redeem.status,
        });
      }

      this.logger.log(
        `Found ${beneficiaries.length} offline beneficiaries for vendor ${payload.vendorUuid}`
      );

      // Check if records are in PENDING state and update to TOKEN_TRANSACTION_INITIATED
      if (redeems.length > 0) {
        // Filter only PENDING records that can be updated
        const pendingRedeems = redeems.filter(
          (redeem) => redeem.status === 'PENDING'
        );

        if (pendingRedeems.length > 0) {
          this.logger.log(
            `Updating ${pendingRedeems.length} PENDING beneficiary redeem records to TOKEN_TRANSACTION_INITIATED for vendor ${payload.vendorUuid}`
          );

          // Update only PENDING redeem records to TOKEN_TRANSACTION_INITIATED
          await this.prisma.beneficiaryRedeem.updateMany({
            where: {
              uuid: {
                in: pendingRedeems.map((redeem) => redeem.uuid),
              },
            },
            data: {
              status: 'TOKEN_TRANSACTION_INITIATED',
            },
          });

          this.logger.log(
            `Successfully updated ${pendingRedeems.length} beneficiary redeem records to TOKEN_TRANSACTION_INITIATED for vendor ${payload.vendorUuid}`
          );
        } else {
          this.logger.log(
            `No PENDING records found to update. Total records: ${redeems.length}`
          );
        }
      }

      return beneficiaries;
    } catch (error) {
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  async syncVendorOfflineData(payload: VendorOfflineSyncDto) {
    try {
      this.logger.log(
        `Syncing offline data for vendor ${payload.vendorUuid} with ${payload.verifiedBeneficiaries.length} verified beneficiaries`
      );

      // First verify the vendor exists
      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });
      if (!vendor) {
        throw new RpcException(
          `Vendor with id ${payload.vendorUuid} not found`
        );
      }

      const results = [];

      for (const item of payload.verifiedBeneficiaries) {
        try {
          const beneficiaryUuid = item.beneficiaryUuid;
          if (!beneficiaryUuid) {
            results.push({
              beneficiaryUuid,
              success: false,
              message: 'Beneficiary UUID missing',
            });
            continue;
          }

          // Find the latest beneficiaryRedeem for this vendor and beneficiary
          const beneficiary = await this.prisma.beneficiary.findUnique({
            where: { uuid: beneficiaryUuid },
          });
          if (!beneficiary) {
            results.push({
              beneficiaryUuid,
              success: false,
              message: 'Beneficiary not found',
            });
            continue;
          }
          const redeemRecord = await this.prisma.beneficiaryRedeem.findFirst({
            where: {
              vendorUid: payload.vendorUuid,
              beneficiaryWalletAddress: beneficiary.walletAddress,
              transactionType: 'VENDOR_REIMBURSEMENT',
            },
            orderBy: { createdAt: 'desc' },
          });
          if (!redeemRecord) {
            results.push({
              beneficiaryUuid,
              success: false,
              message: 'Redemption record not found',
            });
            continue;
          }

          // Do NOT validate OTP here. Only queue for token transfer
          await this.vendorCVAPayoutQueue.add(
            JOBS.VENDOR.PROCESS_OFFLINE_TOKEN_TRANSFER,
            {
              vendorUuid: payload.vendorUuid,
              beneficiaryUuid: beneficiaryUuid,
              amount: redeemRecord.amount,
              otp: item.otp,
            },
            {
              attempts: 3,
              removeOnComplete: true,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            }
          );

          results.push({
            beneficiaryUuid,
            success: true,
            message: 'Queued for token transfer',
          });
        } catch (error) {
          this.logger.error(
            `Error processing redemption for beneficiary ${item.beneficiaryUuid}: ${error.message}`
          );
          results.push({
            beneficiaryUuid: item.beneficiaryUuid,
            success: false,
            message: error.message,
          });
        }
      }

      this.logger.log(
        `Completed syncing offline data for vendor ${
          payload.vendorUuid
        }. Results: ${JSON.stringify(results)}`
      );

      return {
        vendorUuid: payload.vendorUuid,
        totalProcessed: payload.verifiedBeneficiaries.length,
        results,
      };
    } catch (error) {
      this.logger.error(`Error syncing vendor offline data: ${error.message}`);
      throw new RpcException(error.message);
    }
  }
}
