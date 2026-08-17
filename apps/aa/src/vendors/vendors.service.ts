import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_MODULE } from '../constants';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import bcrypt from 'bcryptjs';

import { PaginatorTypes, PrismaService, paginator } from '@rumsan/prisma';
import { PaginationBaseDto } from './common';
import { VendorRedeemDto, VendorStatsDto } from './dto/vendorStats.dto';
import { lastValueFrom } from 'rxjs';
// TODO: STELLAR DETACH - re-enable once stellar module is rewritten and re-exports a
// ReceiveService/equivalent. Was used to fetch vendor on-chain balance.
// import { ReceiveService } from '@rahataid/stellar-sdk';
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
  QueueOfflineRedemptionDto,
} from './dto/vendor-offline-payout.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BQUEUE, JOBS } from '../constants';
import { BatchTransferDto } from '../processors/types';
import { UpdateVendorDetailsDto } from './dto/vendor-details.dto';
import { ChainServiceRegistry } from '../chain/registries/chain-service.registry';

const paginate: PaginatorTypes.PaginateFunction = paginator({ perPage: 20 });

const OFFLINE_REDEEM_BATCH_SIZE = parseInt(
  process.env.OFFLINE_REDEEM_BATCH_SIZE || '10',
  10
);

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CORE_MODULE) private readonly client: ClientProxy,
    // TODO: STELLAR DETACH - re-add once ReceiveService-equivalent is available.
    // private readonly receiveService: ReceiveService,
    @InjectQueue(BQUEUE.BATCH_TRANSFER)
    private readonly batchTransferQueue: Queue,
    @InjectQueue(BQUEUE.VENDOR_CVA)
    private readonly vendorCVAPayoutQueue: Queue,
    @InjectQueue(BQUEUE.OFFLINE_REDEEM)
    private readonly offlineRedeemQueue: Queue,
    private readonly chainServiceRegistry: ChainServiceRegistry
  ) {}

  // Update vendor details
  async updateVendorDetails(dto: UpdateVendorDetailsDto) {
    const { uuid, ...updateData } = dto;

    this.logger.log(`Updating vendor details for ${uuid}`);

    if (!uuid) {
      throw new RpcException({
        message: 'Either id or uuid must be provided',
        code: 'VENDOR_ID_OR_UUID_REQUIRED',
      });
    }

    try {
      const vendorDetails = await this.prisma.vendor.findFirst({
        where: { uuid },
      });

      if (!vendorDetails) {
        throw new RpcException({
          message: 'Vendor not found',
          code: 'VENDOR_NOT_FOUND_GENERIC',
        });
      }

      return this.prisma.vendor.update({
        where: { uuid },
        data: { ...updateData, updatedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(error.message);
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

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
        throw new RpcException({
          message: `Vendor with id ${vendorWallet.uuid} not found`,
          code: 'VENDOR_NOT_FOUND',
          params: { uuid: vendorWallet.uuid },
        });
      }

      // TODO: STELLAR DETACH - re-enable vendor on-chain balance lookup once the
      // stellar module is rewritten and exposes a ReceiveService-equivalent.
      // const vendorBalance = await this.receiveService.getAccountBalance(
      //   vendor.walletAddress
      // );
      //
      // if (!vendorBalance) {
      //   throw new RpcException(
      //     `Failed to get balance for vendor with id ${vendorWallet.uuid}`
      //   );
      // }
      const vendorBalance = null;

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
      if (error instanceof RpcException) throw error;
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
      if (error instanceof RpcException) throw error;
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
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: 'No redemption requests found for vendor',
          code: 'NO_REDEMPTION_REQUESTS',
        });
      }

      return redemptionRequest;
    } catch (error) {
      this.logger.error(error.message);
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  async getTxnAndRedemptionList(payload: VendorRedeemTxnListDto) {
    try {
      const { page, perPage, uuid, txHash, status } = payload;
      const query = {
        where: {
          vendorUid: uuid,
          status,
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
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Transactions not found for vendor with id ${walletBalanceDto.uuid}`,
          code: 'VENDOR_TRANSACTIONS_NOT_FOUND',
          params: { uuid: walletBalanceDto.uuid },
        });
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
        throw new RpcException({
          message: `Failed to get beneficiaries info`,
          code: 'VENDOR_BENEFICIARIES_INFO_FAILED',
        });
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
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Vendor with id ${payload.vendorUuid} not found`,
          code: 'VENDOR_NOT_FOUND',
          params: { uuid: payload.vendorUuid },
        });
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
      if (error instanceof RpcException) throw error;
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
      if (error instanceof RpcException) throw error;
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
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  // Chunks a vendor's pending offline redemptions into batches of
  // OFFLINE_REDEEM_BATCH_SIZE, persists each batch to a temp table (crash-safe),
  // then queues one job per batch. Worker re-reads the batch from the temp row,
  // so only `batchId` needs to travel in the job payload.
  async queueOfflineRedemption(payload: QueueOfflineRedemptionDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { uuid: payload.vendorUuid },
    });
    if (!vendor) {
      throw new RpcException({
      message: `Vendor with id ${payload.vendorUuid} not found`,
      code: 'VENDOR_NOT_FOUND',
      params: { uuid: payload.vendorUuid },
    });
    }

    const pending = await this.prisma.beneficiaryRedeem.findMany({
      where: {
        vendorUid: payload.vendorUuid,
        transactionType: 'VENDOR_REIMBURSEMENT',
        status: 'PENDING',
        isCompleted: false,
      },
    });

    if (pending.length === 0) {
      return { success: true, message: 'No pending offline redemptions', totalBatches: 0 };
    }

    const chainType = await this.chainServiceRegistry.detectChainFromSettings();

    const items = pending.map((r) => ({
      redeemUuid: r.uuid,
      beneficiaryWalletAddress: r.beneficiaryWalletAddress,
      vendorWalletAddress: vendor.walletAddress,
      amount: r.amount,
    }));

    const batches: (typeof items)[] = [];
    for (let i = 0; i < items.length; i += OFFLINE_REDEEM_BATCH_SIZE) {
      batches.push(items.slice(i, i + OFFLINE_REDEEM_BATCH_SIZE));
    }

    const batchRecords = await Promise.all(
      batches.map((batch) =>
        this.prisma.tempOfflineRedemption.create({
          data: {
            chainType,
            vendorId: vendor.uuid,
            payloads: batch,
            status: 'PENDING',
          },
        })
      )
    );

    await Promise.all(
      batchRecords.map((record) =>
        this.offlineRedeemQueue.add(
          JOBS.VENDOR.OFFLINE_REDEEM_BATCH,
          { batchId: record.uuid },
          {
            jobId: record.uuid,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        )
      )
    );

    this.logger.log(
      `Queued ${batchRecords.length} offline redemption batch(es) for vendor ${payload.vendorUuid} on chain ${chainType}`
    );

    return {
      success: true,
      message: 'Offline redemptions queued',
      totalRedemptions: items.length,
      totalBatches: batchRecords.length,
      chainType,
    };

    return { success: true, message: 'Offline redemptions queued' };
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

      await this.vendorCVAPayoutQueue.add(JOBS.VENDOR.OFFLINE_PAYOUT, jobData);

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
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Vendor with id ${payload.vendorUuid} not found`,
          code: 'VENDOR_NOT_FOUND',
          params: { uuid: payload.vendorUuid },
        });
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
      if (error instanceof RpcException) throw error;
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
        throw new RpcException({
          message: `Vendor with id ${payload.vendorUuid} not found`,
          code: 'VENDOR_NOT_FOUND',
          params: { uuid: payload.vendorUuid },
        });
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
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  async syncVendorOfflineData(payload: VendorOfflineSyncDto) {
    try {
      this.logger.log(
        `Syncing offline data for vendor ${payload.vendorUuid} with ${payload.verifiedBeneficiaries.length} verified beneficiaries`
      );

      const vendor = await this.prisma.vendor.findUnique({
        where: { uuid: payload.vendorUuid },
      });
      if (!vendor) {
        throw new RpcException({
          message: `Vendor with id ${payload.vendorUuid} not found`,
          code: 'VENDOR_NOT_FOUND',
          params: { uuid: payload.vendorUuid },
        });
      }

      // Get verified beneficiary UUIDs + OTP map
      const verifiedMap = new Map(
        payload.verifiedBeneficiaries.map(b => [b.beneficiaryUuid, b.otp])
      );

      // Fetch all pending VENDOR_REIMBURSEMENT for vendor
      const pending = await this.prisma.beneficiaryRedeem.findMany({
        where: {
          vendorUid: payload.vendorUuid,
          transactionType: 'VENDOR_REIMBURSEMENT',
          status: 'TOKEN_TRANSACTION_INITIATED',
          isCompleted: false,
        },
        include: { Beneficiary: true },
      });

      // Filter to only verified beneficiaries
      const verified = pending.filter(r =>
        verifiedMap.has(r.Beneficiary?.uuid)
      );

      if (verified.length === 0) {
        return {
          success: true,
          message: 'No matching verified beneficiaries found',
          totalProcessed: payload.verifiedBeneficiaries.length,
          totalQueued: 0,
        };
      }

      const chainType = await this.chainServiceRegistry.detectChainFromSettings();

      const items = verified.map(r => ({
        redeemUuid: r.uuid,
        beneficiaryWalletAddress: r.beneficiaryWalletAddress,
        vendorWalletAddress: vendor.walletAddress,
        amount: r.amount,
        otp: verifiedMap.get(r.Beneficiary?.uuid), // ponytail: store OTP in batch for processor validation if needed later
      }));

      const batches: (typeof items)[] = [];
      for (let i = 0; i < items.length; i += OFFLINE_REDEEM_BATCH_SIZE) {
        batches.push(items.slice(i, i + OFFLINE_REDEEM_BATCH_SIZE));
      }

      const batchRecords = await Promise.all(
        batches.map(batch =>
          this.prisma.tempOfflineRedemption.create({
            data: {
              chainType,
              vendorId: vendor.uuid,
              payloads: batch,
              status: 'PENDING',
            },
          })
        )
      );

      await Promise.all(
        batchRecords.map((record: any) =>
          this.offlineRedeemQueue.add(
            JOBS.VENDOR.OFFLINE_REDEEM_BATCH,
            { batchId: record.uuid },
            {
              jobId: record.uuid,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            }
          )
        )
      );

      this.logger.log(
        `Synced ${verified.length} verified beneficiaries into ${batchRecords.length} batch(es) for vendor ${payload.vendorUuid} on chain ${chainType}`
      );

      return {
        success: true,
        message: 'Offline redemptions queued for verified beneficiaries',
        totalProcessed: payload.verifiedBeneficiaries.length,
        totalQueued: verified.length,
        totalBatches: batchRecords.length,
        chainType,
      };
    } catch (error) {
      this.logger.error(`Error syncing vendor offline data: ${error.message}`);
      if (error instanceof RpcException) throw error;
      throw new RpcException(error.message);
    }
  }

  async processBatchTransfer(data: BatchTransferDto) {
    this.logger.log(
      `Processing batch transfer with ${
        data.transfers.length
      } transfers. Batch ID: ${data.batchId || 'N/A'}`,
      VendorsService.name
    );

    try {
      const job = await this.batchTransferQueue.add(
        JOBS.BATCH_TRANSFER.PROCESS_BATCH,
        data,
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
        `Batch transfer job added to queue with ID: ${job.id}`,
        VendorsService.name
      );

      return {
        success: true,
        jobId: job.id,
        message: 'Batch transfer added successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to process batch transfer: ${error.message}`,
        error.stack,
        VendorsService.name
      );

      return {
        success: false,
        error: error.message,
        message: 'Failed to process batch transfer',
      };
    }
  }
}
